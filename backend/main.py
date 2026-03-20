"""
main.py — FastAPI application for GymPulse (FalkorDB Graph Edition).

Authentication model
────────────────────
• POST /auth/admin/login  → JWT with role='admin'  (username + password)
• POST /auth/member/login → JWT with role='member' (email    + password)

Protected endpoints
───────────────────
• Equipment write/delete : require_admin
• POST /reservations     : require_member_or_admin (member_id injected from JWT)
• PUT  /reservations/{id}: require_member_or_admin (ownership enforced)
• POST /usage-logs       : require_admin
• POST /members          : public (self-registration)

Seed accounts (created only if missing)
────────────────────────────────────────
• Admin  : username=admin   password=admin123
• Members: Alice/Bob/Charlie password=password123
"""

import logging
import os
import random
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query, Request, status, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from falkordb import Graph
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import get_graph
from auth import (
    create_access_token, hash_password,
    require_admin, require_member_or_admin,
)
from schemas import (
    EquipmentCreate, EquipmentUpdate, EquipmentRead,
    UsageLogCreate, UsageLogRead,
    ReservationCreate, ReservationUpdate, ReservationRead,
    GymZoneCreate, GymZoneRead,
    MaintenanceTicketCreate, MaintenanceTicketRead,
    MembershipPlanCreate, MembershipPlanRead,
    MemberCreate, MemberRead,
    TrainerCreate, TrainerRead,
    WorkoutClassCreate, WorkoutClassRead,
    AnalyticsSummary, MostUsedEquipment, PeakHourEntry,
    LoginRequest, Token,
)
from services import (
    EquipmentService, UsageLogService, ReservationService, AnalyticsService,
    GymZoneService, MaintenanceTicketService,
    MembershipPlanService, MemberService, TrainerService, WorkoutClassService,
    AuthService,
)

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _seed_data_if_empty()
    _migrate_equipment_names()
    _ensure_admin_exists()
    _ensure_member_passwords()
    _ensure_diana_exists()
    _seed_peak_hour_reservations()
    _align_log_times_to_5min()
    _randomize_seed_notes()
    yield


app = FastAPI(
    title="GymPulse API (FalkorDB Graph Edition - 10 Entities)",
    description="Track gym equipment usage using a high-performance Graph Database.",
    version="3.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,   # JWT lives in Authorization header, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many login attempts. Please wait a moment and try again."},
    )


# ═══════════════════════════════════════════════════════════════════════════
# WEBSOCKET — real-time push notifications
# ═══════════════════════════════════════════════════════════════════════════

class ConnectionManager:
    """Tracks all open WebSocket connections and broadcasts events to them."""

    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._connections:
            self._connections.remove(ws)

    async def broadcast(self, payload: dict) -> None:
        """Send payload to every connected client; silently drop dead sockets."""
        dead = []
        for ws in self._connections:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = ConnectionManager()


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: str = Query(None)):
    from auth import _decode_token
    if not token or not _decode_token(token):
        await websocket.close(code=1008)
        return
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive; we only push from server → client.
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all for unhandled exceptions.
    Logs the full error server-side and returns a safe generic message to the client.
    """
    ref = uuid.uuid4().hex[:8].upper()
    logger.exception(f"Unhandled error [ref={ref}] on {request.method} {request.url}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"An internal error occurred. (ref: {ref})"},
    )


# ═══════════════════════════════════════════════════════════════════════════
# Startup — seed data + ensure auth accounts exist
# ═══════════════════════════════════════════════════════════════════════════

_RESERVATION_NOTES = [
    "Morning cardio session",
    "Strength training",
    "Warm-up before class",
    "Post-class cooldown",
    "Quick cardio",
    "Leg day",
    "Upper body workout",
    "HIIT session",
    "Endurance training",
    "Core workout",
    "Full body session",
    "Pre-work stretch",
    "Lunch break workout",
    "After work session",
    "Interval training",
    "Recovery session",
    "Chest and back day",
    "Cardio and abs",
    "Shoulder workout",
    "Arm day",
    "Weekend training",
    "Competition prep",
    "Rehab exercise",
    "Flexibility training",
    "Weight loss session",
    "Muscle building",
    "Low intensity steady state",
    "Sports conditioning",
    "Functional training",
    "Circuit training",
]



def _seed_data_if_empty():
    """Seed Graph database with Nodes and Edges (skips if already seeded)."""
    from database import db_client
    graph = db_client.select_graph("gympulse")

    try:
        if graph.query("MATCH (z:GymZone) RETURN count(z)").result_set[0][0] > 0:
            return
    except Exception:
        pass

    print("Seeding FalkorDB Graph Database...")

    seed_query = """
    CREATE (z1:GymZone {name: 'Cardio Floor', description: 'Treadmills and ellipticals'})
    CREATE (z2:GymZone {name: 'Free Weights', description: 'Dumbbells and benches'})
    CREATE (z3:GymZone {name: 'Yoga Studio', description: 'Mats and open space'})

    CREATE (p1:MembershipPlan {name: 'Basic',   price_monthly: 29.99, description: 'Standard access'})
    CREATE (p2:MembershipPlan {name: 'Premium', price_monthly: 59.99, description: 'Includes group classes'})

    CREATE (t1:Trainer {name: 'Sarah Connor', specialty: 'HIIT',     hire_date: '2022-01-10T00:00:00'})
    CREATE (t2:Trainer {name: 'Arnold S.',    specialty: 'Strength', hire_date: '2021-06-15T00:00:00'})

    CREATE (e1:Equipment {name: 'Treadmill',  category: 'Cardio',    zone: 'Cardio Floor', status: 'available',    description: 'Commercial grade'})
    CREATE (e2:Equipment {name: 'Elliptical', category: 'Cardio',    zone: 'Cardio Floor', status: 'in_use',       description: 'Commercial grade'})
    CREATE (e3:Equipment {name: 'Bench Press',    category: 'Strength',  zone: 'Free Weights', status: 'available',    description: 'Flat bench'})
    CREATE (e4:Equipment {name: 'Squat Rack',     category: 'Strength',  zone: 'Free Weights', status: 'available',    description: 'Power rack'})
    CREATE (e5:Equipment {name: 'Rowing Machine', category: 'Cardio',    zone: 'Cardio Floor', status: 'maintenance',  description: 'Water rower'})

    CREATE (e1)-[:LOCATED_IN]->(z1)
    CREATE (e2)-[:LOCATED_IN]->(z1)
    CREATE (e3)-[:LOCATED_IN]->(z2)
    CREATE (e4)-[:LOCATED_IN]->(z2)
    CREATE (e5)-[:LOCATED_IN]->(z1)

    CREATE (m1:Member {name: 'Alice',   email: 'alice@test.com',   join_date: '2023-01-15T00:00:00'})
    CREATE (m2:Member {name: 'Bob',     email: 'bob@test.com',     join_date: '2023-03-10T00:00:00'})
    CREATE (m3:Member {name: 'Charlie', email: 'charlie@test.com', join_date: '2023-06-01T00:00:00'})

    CREATE (m1)-[:HAS_PLAN]->(p2)
    CREATE (m2)-[:HAS_PLAN]->(p1)
    CREATE (m3)-[:HAS_PLAN]->(p2)

    CREATE (c1:WorkoutClass {name: 'Morning HIIT', schedule_time: '2025-10-25T08:00:00', max_capacity: 20})
    CREATE (c2:WorkoutClass {name: 'Heavy Lifts',  schedule_time: '2025-10-26T18:00:00', max_capacity: 15})

    CREATE (t1)-[:LEADS]->(c1)
    CREATE (t2)-[:LEADS]->(c2)
    CREATE (m1)-[:ENROLLED_IN]->(c1)
    CREATE (m3)-[:ENROLLED_IN]->(c1)
    CREATE (m2)-[:ENROLLED_IN]->(c2)

    CREATE (mt:MaintenanceTicket {issue_description: 'Broken chain', status: 'open', reported_date: '2023-10-24T10:00:00'})
    CREATE (mt)-[:REPAIRS]->(e5)
    """
    graph.query(seed_query)

    # Usage logs (56 entries over last 7 days)
    now = datetime.utcnow()
    random.seed(42)

    eq_ids   = [r[0] for r in graph.query("MATCH (e:Equipment) RETURN ID(e)").result_set]
    mem_data = [(r[0], r[1]) for r in graph.query("MATCH (m:Member) RETURN ID(m), m.name").result_set]

    for day_offset in range(7):
        day = now - timedelta(days=day_offset)
        for _ in range(8):
            eq_id            = random.choice(eq_ids)
            mem_id, mem_name = random.choice(mem_data)
            hour             = random.choice([7, 8, 12, 17, 18, 19])
            start            = day.replace(hour=hour, minute=0, second=0, microsecond=0)
            duration         = random.choice([20, 25, 30, 35, 40, 45])  # multiples of 5
            end              = start + timedelta(minutes=duration)
            wait_time        = round(random.uniform(0, 10), 1)

            graph.query(
                """
                MATCH (e:Equipment), (m:Member)
                WHERE ID(e) = $eq_id AND ID(m) = $mem_id
                CREATE (u:UsageLog {
                    start_time: $start,
                    end_time: $end,
                    duration_minutes: $duration,
                    queue_wait_minutes: $wait_time,
                    member_name: $mem_name
                })
                CREATE (u)-[:USED]->(e)
                CREATE (u)-[:LOGGED_BY]->(m)
                """,
                {
                    "eq_id":     eq_id,
                    "mem_id":    mem_id,
                    "start":     start.isoformat(),
                    "end":       end.isoformat(),
                    "duration":  duration,
                    "wait_time": wait_time,
                    "mem_name":  mem_name,
                },
            )

    # One seeded reservation (tomorrow, for Alice, on Treadmill)
    tomorrow     = (now + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
    end_tomorrow = tomorrow + timedelta(hours=1)
    alice_name   = mem_data[0][1]
    alice_id     = mem_data[0][0]
    graph.query(
        """
        MATCH (e:Equipment), (m:Member)
        WHERE ID(e) = $eid AND ID(m) = $mid
        CREATE (r:Reservation {
            start_time:  $start,
            end_time:    $end,
            status:      'confirmed',
            notes:       'Morning cardio session',
            member_name: $mname,
            member_id:   $mid
        })
        CREATE (r)-[:RESERVES]->(e)
        CREATE (r)-[:BOOKED_BY]->(m)
        """,
        {
            "eid":   eq_ids[0],
            "mid":   alice_id,
            "mname": alice_name,
            "start": tomorrow.isoformat(),
            "end":   end_tomorrow.isoformat(),
        },
    )


def _migrate_equipment_names():
    """Rename legacy equipment names to the new canonical names."""
    from database import db_client
    graph = db_client.select_graph("gympulse")
    renames = [
        ("Treadmill #1", "Treadmill"),
        ("Treadmill #2", "Elliptical"),
    ]
    for old, new in renames:
        graph.query(
            "MATCH (e:Equipment {name: $old}) SET e.name = $new",
            {"old": old, "new": new},
        )
        # Keep reservation member_name field consistent too
        graph.query(
            "MATCH (r:Reservation)-[:RESERVES]->(e:Equipment {name: $new}) "
            "WHERE r.equipment_name = $old SET r.equipment_name = $new",
            {"old": old, "new": new},
        )


def _ensure_admin_exists():
    """Create the default admin account if no Admin nodes exist in the graph."""
    from database import db_client
    graph = db_client.select_graph("gympulse")

    count = graph.query("MATCH (a:Admin) RETURN count(a)").result_set[0][0]
    if count > 0:
        return

    hashed = hash_password("admin123")
    graph.query(
        "CREATE (a:Admin {username: 'admin', hashed_password: $hp})",
        {"hp": hashed},
    )
    logger.info("Default admin account created.")


def _ensure_diana_exists():
    """Create a 4th seed member 'Diana' if she doesn't exist yet."""
    from database import db_client
    graph = db_client.select_graph("gympulse")

    count = graph.query(
        "MATCH (m:Member {email: 'diana@test.com'}) RETURN count(m)"
    ).result_set[0][0]
    if count > 0:
        return

    hashed = hash_password("password123")
    graph.query(
        """
        MATCH (p:MembershipPlan {name: 'Basic'})
        CREATE (m:Member {
            name: 'Diana',
            email: 'diana@test.com',
            join_date: $join,
            hashed_password: $hp
        })
        CREATE (m)-[:HAS_PLAN]->(p)
        """,
        {"join": datetime.utcnow().isoformat(), "hp": hashed},
    )
    logger.info("Seed member Diana created.")


def _ensure_member_passwords():
    """
    Add bcrypt passwords to seeded Member nodes that don't have one yet.
    This runs safely on existing databases — it only touches nodes where
    hashed_password is null, leaving any already-set passwords untouched.
    """
    from database import db_client
    graph = db_client.select_graph("gympulse")

    # Fetch members that are missing hashed_password
    res = graph.query(
        "MATCH (m:Member) WHERE m.hashed_password IS NULL RETURN ID(m)"
    )
    if not res.result_set:
        return

    hashed = hash_password("password123")
    for row in res.result_set:
        mid = row[0]
        graph.query(
            "MATCH (m:Member) WHERE ID(m) = $id SET m.hashed_password = $hp",
            {"id": mid, "hp": hashed},
        )
    logger.info(f"Member passwords seeded for {len(res.result_set)} account(s).")


def _align_log_times_to_5min():
    """
    Round all UsageLog end_times to the nearest 5-minute boundary.

    Idempotent: logs already on a 5-minute boundary are skipped.
    Fixes existing seeded data (created with random 1-minute resolution)
    so every time displayed in the admin table is consistent with the
    5-minute interval enforced by the date pickers.
    """
    from database import db_client
    graph = db_client.select_graph("gympulse")

    res = graph.query("MATCH (u:UsageLog) RETURN ID(u), u.start_time, u.end_time")
    updated = 0

    for row in res.result_set:
        node_id, start_str, end_str = row
        if not start_str or not end_str:
            continue
        try:
            end_dt   = datetime.fromisoformat(end_str)
            start_dt = datetime.fromisoformat(start_str)
        except ValueError:
            continue

        remainder = end_dt.minute % 5
        if remainder == 0 and end_dt.second == 0:
            continue  # already aligned — nothing to do

        # Round to nearest 5-minute boundary (half-way rounds up)
        if remainder < 3:
            adjustment = -remainder          # round down
        else:
            adjustment = 5 - remainder      # round up

        new_end = end_dt.replace(second=0, microsecond=0) + timedelta(minutes=adjustment)
        new_duration = round((new_end - start_dt).total_seconds() / 60, 2)

        graph.query(
            "MATCH (u:UsageLog) WHERE ID(u) = $id "
            "SET u.end_time = $end, u.duration_minutes = $dur",
            {"id": node_id, "end": new_end.isoformat(), "dur": new_duration},
        )
        updated += 1

    if updated:
        print(f"Aligned {updated} usage log end-time(s) to 5-minute boundaries.")


def _seed_peak_hour_reservations():
    """
    Seed historical reservations for the Peak Usage Hours chart.

    Target distribution (requested):
        7 AM  → 10 reservations
        8 AM  → 10 reservations
        9 AM  → 15 reservations
       13 PM  → 13 reservations
       14 PM  →  5 reservations

    Guard: skips if there are already 50 or more Reservation nodes so that
    re-starting the server on a populated DB never duplicates seed data.
    All records are written directly via Cypher (bypassing API validation)
    and use past dates so they never conflict with future user bookings.
    """
    from database import db_client
    graph = db_client.select_graph("gympulse")

    existing = graph.query("MATCH (r:Reservation) RETURN count(r)").result_set[0][0]
    if existing >= 50:
        return  # already seeded

    eq_ids = [r[0] for r in graph.query("MATCH (e:Equipment) RETURN ID(e)").result_set]
    mem_data = [(r[0], r[1]) for r in graph.query("MATCH (m:Member) RETURN ID(m), m.name").result_set]
    if not eq_ids or not mem_data:
        return  # equipment / members not seeded yet — nothing to do

    print("Seeding peak-hour reservation data...")

    # (hour, count) pairs matching the requested distribution
    hour_counts = [(7, 10), (8, 10), (9, 15), (13, 13), (14, 5)]

    # Spread reservations over the past 30 days so that same-equipment
    # slots on the same day don't clash with each other.
    base_day = datetime.utcnow() - timedelta(days=30)

    for hour, total in hour_counts:
        for i in range(total):
            day_offset = i % 28          # cycle through 28 days
            eq_id = eq_ids[i % len(eq_ids)]
            mem_id, mem_name = mem_data[i % len(mem_data)]

            start = (base_day + timedelta(days=day_offset)).replace(
                hour=hour, minute=0, second=0, microsecond=0
            )
            end = start + timedelta(minutes=45)
            note = random.choice(_RESERVATION_NOTES)

            graph.query(
                """
                MATCH (e:Equipment), (m:Member)
                WHERE ID(e) = $eid AND ID(m) = $mid
                CREATE (r:Reservation {
                    start_time:  $start,
                    end_time:    $end,
                    status:      'confirmed',
                    member_name: $mname,
                    member_id:   $mid,
                    notes:       $note
                })
                CREATE (r)-[:RESERVES]->(e)
                CREATE (r)-[:BOOKED_BY]->(m)
                """,
                {
                    "eid":   eq_id,
                    "mid":   mem_id,
                    "mname": mem_name,
                    "start": start.isoformat(),
                    "end":   end.isoformat(),
                    "note":  note,
                },
            )

    total_seeded = sum(c for _, c in hour_counts)
    print(f"Peak-hour reservations seeded: {total_seeded} records "
          f"(7 AM×10, 8 AM×10, 9 AM×15, 1 PM×13, 2 PM×5)")


def _randomize_seed_notes():
    """
    Replace the placeholder 'peak-hour seed' note on existing reservations
    with a random realistic note from _RESERVATION_NOTES.

    Idempotent: only touches reservations whose notes field is exactly
    'peak-hour seed', so user-entered notes are never modified.
    """
    from database import db_client
    graph = db_client.select_graph("gympulse")

    res = graph.query(
        "MATCH (r:Reservation) WHERE r.notes = 'peak-hour seed' RETURN ID(r)"
    )
    if not res.result_set:
        return

    for row in res.result_set:
        node_id = row[0]
        note = random.choice(_RESERVATION_NOTES)
        graph.query(
            "MATCH (r:Reservation) WHERE ID(r) = $id SET r.notes = $note",
            {"id": node_id, "note": note},
        )

    print(f"Randomized notes for {len(res.result_set)} seeded reservation(s).")


# ═══════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/auth/admin/login", response_model=Token, tags=["Auth"])
@limiter.limit("10/minute")
def admin_login(request: Request, data: LoginRequest, graph: Graph = Depends(get_graph)):
    """Authenticate an admin and return a JWT. Credentials checked against the DB."""
    admin = AuthService.authenticate_admin(graph, data.username, data.password)
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials.",
        )
    token = create_access_token(
        sub=str(admin["id"]), role="admin", name=admin["username"]
    )
    return Token(access_token=token, role="admin", name=admin["username"])


@app.post("/auth/member/login", response_model=Token, tags=["Auth"])
@limiter.limit("10/minute")
def member_login(request: Request, data: LoginRequest, graph: Graph = Depends(get_graph)):
    """Authenticate a member by email+password and return a JWT."""
    member = AuthService.authenticate_member(graph, data.username, data.password)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    token = create_access_token(
        sub=str(member["id"]), role="member", name=member["name"]
    )
    return Token(access_token=token, role="member", name=member["name"], member_id=member["id"])


# ═══════════════════════════════════════════════════════════════════════════
# EQUIPMENT ROUTES
# ═══════════════════════════════════════════════════════════════════════════

_VALID_EQUIPMENT_STATUSES    = {"available", "in_use", "reserved", "maintenance"}
_VALID_RESERVATION_STATUSES  = {"confirmed", "cancelled", "completed"}


@app.get("/equipment", response_model=List[EquipmentRead], tags=["Equipment"])
def list_equipment(status: Optional[str] = Query(None), graph: Graph = Depends(get_graph)):
    if status and status not in _VALID_EQUIPMENT_STATUSES:
        raise HTTPException(400, f"Invalid status '{status}'. Must be one of: {sorted(_VALID_EQUIPMENT_STATUSES)}")
    return EquipmentService.list_all(graph, status=status)

@app.get("/equipment/{equipment_id}", response_model=EquipmentRead, tags=["Equipment"])
def get_equipment(equipment_id: int, graph: Graph = Depends(get_graph)):
    eq = EquipmentService.get_by_id(graph, equipment_id)
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found.")
    return eq

@app.post("/equipment", response_model=EquipmentRead, status_code=201, tags=["Equipment"])
def create_equipment(
    data: EquipmentCreate,
    background_tasks: BackgroundTasks,
    graph: Graph = Depends(get_graph),
    _: dict = Depends(require_admin),
):
    result = EquipmentService.create(graph, data)
    background_tasks.add_task(ws_manager.broadcast, {"type": "data_changed"})
    return result

@app.put("/equipment/{equipment_id}", response_model=EquipmentRead, tags=["Equipment"])
def update_equipment(
    equipment_id: int,
    data: EquipmentUpdate,
    background_tasks: BackgroundTasks,
    graph: Graph = Depends(get_graph),
    _: dict = Depends(require_admin),
):
    eq = EquipmentService.update(graph, equipment_id, data)
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found.")
    background_tasks.add_task(ws_manager.broadcast, {"type": "data_changed"})
    return eq

@app.delete("/equipment/{equipment_id}", status_code=204, tags=["Equipment"])
def delete_equipment(
    equipment_id: int,
    background_tasks: BackgroundTasks,
    graph: Graph = Depends(get_graph),
    _: dict = Depends(require_admin),
):
    if not EquipmentService.delete(graph, equipment_id):
        raise HTTPException(status_code=404, detail="Equipment not found.")
    background_tasks.add_task(ws_manager.broadcast, {"type": "data_changed"})
    return None


# ═══════════════════════════════════════════════════════════════════════════
# NEW ENTITIES CRUD
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/gym-zones", response_model=List[GymZoneRead], tags=["Gym Zones"])
def list_gym_zones(graph: Graph = Depends(get_graph)):
    return GymZoneService.list_all(graph)

@app.post("/gym-zones", response_model=GymZoneRead, tags=["Gym Zones"])
def create_gym_zone(
    data: GymZoneCreate,
    graph: Graph = Depends(get_graph),
    _: dict = Depends(require_admin),
):
    return GymZoneService.create(graph, data)

@app.get("/members", response_model=List[MemberRead], tags=["Members"])
def list_members(graph: Graph = Depends(get_graph)):
    return MemberService.list_all(graph)

@app.post("/members", response_model=MemberRead, status_code=201, tags=["Members"])
@limiter.limit("5/minute")
def create_member(request: Request, data: MemberCreate, graph: Graph = Depends(get_graph)):
    """Public self-registration endpoint. Password is hashed server-side."""
    try:
        return MemberService.create(graph, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

@app.get("/membership-plans", response_model=List[MembershipPlanRead], tags=["Memberships"])
def list_plans(graph: Graph = Depends(get_graph)):
    return MembershipPlanService.list_all(graph)

@app.get("/trainers", response_model=List[TrainerRead], tags=["Staff"])
def list_trainers(graph: Graph = Depends(get_graph)):
    return TrainerService.list_all(graph)

@app.get("/workout-classes", response_model=List[WorkoutClassRead], tags=["Staff"])
def list_classes(graph: Graph = Depends(get_graph)):
    return WorkoutClassService.list_all(graph)

@app.get("/maintenance-tickets", response_model=List[MaintenanceTicketRead], tags=["Maintenance"])
def list_tickets(graph: Graph = Depends(get_graph)):
    return MaintenanceTicketService.list_all(graph)


# ═══════════════════════════════════════════════════════════════════════════
# USAGE LOG ROUTES
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/usage-logs", response_model=List[UsageLogRead], tags=["Usage Logs"])
def list_usage_logs(
    equipment_id: Optional[int] = Query(None),
    graph: Graph = Depends(get_graph),
):
    return UsageLogService.list_all(graph, equipment_id=equipment_id)

@app.post("/usage-logs", response_model=UsageLogRead, status_code=201, tags=["Usage Logs"])
def create_usage_log(
    data: UsageLogCreate,
    graph: Graph = Depends(get_graph),
    _: dict = Depends(require_admin),
):
    if not EquipmentService.get_by_id(graph, data.equipment_id):
        raise HTTPException(status_code=404, detail="Equipment not found.")
    return UsageLogService.create(graph, data)


# ═══════════════════════════════════════════════════════════════════════════
# RESERVATION ROUTES
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/reservations", response_model=List[ReservationRead], tags=["Reservations"])
def list_reservations(
    status: Optional[str] = Query(None),
    graph: Graph = Depends(get_graph),
):
    if status and status not in _VALID_RESERVATION_STATUSES:
        raise HTTPException(400, f"Invalid status '{status}'. Must be one of: {sorted(_VALID_RESERVATION_STATUSES)}")
    return ReservationService.list_all(graph, status=status)

@app.post("/reservations", response_model=ReservationRead, status_code=201, tags=["Reservations"])
def create_reservation(
    data: ReservationCreate,
    background_tasks: BackgroundTasks,
    graph: Graph = Depends(get_graph),
    current_user: dict = Depends(require_member_or_admin),
):
    """
    Create a reservation. Caller must be authenticated.
    The member_id and member_name are injected from the JWT — the client
    cannot spoof these values.
    """
    if not EquipmentService.get_by_id(graph, data.equipment_id):
        raise HTTPException(status_code=404, detail="Equipment not found.")

    # Explicit duration guard (also enforced by Pydantic schema, belt-and-suspenders)
    start_naive = data.start_time.replace(tzinfo=None) if data.start_time.tzinfo else data.start_time
    end_naive   = data.end_time.replace(tzinfo=None)   if data.end_time.tzinfo   else data.end_time
    if end_naive <= start_naive:
        raise HTTPException(status_code=400, detail="end_time must be strictly after start_time.")
    duration_min = (end_naive - start_naive).total_seconds() / 60
    if duration_min > 60:
        raise HTTPException(status_code=400, detail="Reservation duration cannot exceed 60 minutes.")

    # Inject authenticated identity (overrides any client-supplied values)
    auth_member_id   = int(current_user["sub"]) if current_user["role"] == "member" else None
    auth_member_name = current_user["name"]

    try:
        result = ReservationService.create(
            graph, data,
            auth_member_id=auth_member_id,
            auth_member_name=auth_member_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    background_tasks.add_task(ws_manager.broadcast, {"type": "data_changed"})
    return result

@app.put("/reservations/{reservation_id}", response_model=ReservationRead, tags=["Reservations"])
def update_reservation(
    reservation_id: int,
    data: ReservationUpdate,
    background_tasks: BackgroundTasks,
    graph: Graph = Depends(get_graph),
    current_user: dict = Depends(require_member_or_admin),
):
    """
    Update/cancel a reservation.
    Members may only modify their own reservations.
    Admins may modify any reservation.
    """
    existing = ReservationService.get_by_id(graph, reservation_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found.")

    # Ownership check — members can only cancel their own reservations
    if current_user["role"] == "member":
        owner_id = existing.get("member_id")
        caller_id = int(current_user["sub"])
        if owner_id != caller_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only modify your own reservations.",
            )

    # Prevent cancelling an already-cancelled or completed reservation
    if data.status == "cancelled" and existing.get("status") != "confirmed":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a reservation with status '{existing.get('status')}'.",
        )

    # Prevent cancelling a reservation whose start time is in the past
    if data.status == "cancelled":
        start_val = existing.get("start_time")
        if start_val is not None:
            # start_val may be a datetime object (after _parse_datetime) or a string
            if isinstance(start_val, datetime):
                start_dt = start_val
            else:
                try:
                    start_dt = datetime.fromisoformat(str(start_val).replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    start_dt = None
            if start_dt is not None:
                start_naive = start_dt.replace(tzinfo=None) if start_dt.tzinfo else start_dt
                if start_naive <= datetime.utcnow():
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot cancel a reservation that has already started or passed.",
                    )

    res = ReservationService.update(graph, reservation_id, data)
    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    background_tasks.add_task(ws_manager.broadcast, {"type": "data_changed"})
    return res


# ═══════════════════════════════════════════════════════════════════════════
# ANALYTICS & PREDICTIONS
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/analytics/summary", response_model=AnalyticsSummary, tags=["Analytics"])
def analytics_summary(graph: Graph = Depends(get_graph)):
    return AnalyticsService.summary(graph)

@app.get("/analytics/most-used", response_model=List[MostUsedEquipment], tags=["Analytics"])
def analytics_most_used(
    limit: int = Query(10, ge=1, le=50),
    graph: Graph = Depends(get_graph),
):
    return AnalyticsService.most_used(graph, limit=limit)

@app.get("/analytics/peak-hours", response_model=List[PeakHourEntry], tags=["Analytics"])
def analytics_peak_hours(
    date: Optional[str] = Query(None, description="Filter to a specific date (YYYY-MM-DD local time)"),
    graph: Graph = Depends(get_graph),
):
    return AnalyticsService.peak_hours(graph, date_str=date)


