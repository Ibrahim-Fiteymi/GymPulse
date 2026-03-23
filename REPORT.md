# GymPulse — Technical Report

## Table of Contents

1. [Introduction](#1-introduction)
2. [Business Problem](#2-business-problem)
3. [Proposed Solution](#3-proposed-solution)
4. [System Architecture](#4-system-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Database — FalkorDB Graph Database](#6-database--falkordb-graph-database)
7. [Entities and Relationships](#7-entities-and-relationships)
8. [Backend — FastAPI](#8-backend--fastapi)
9. [Pydantic Validation](#9-pydantic-validation)
10. [Authentication and Security](#10-authentication-and-security)
11. [Frontend — React + Vite](#11-frontend--react--vite)
12. [Real-Time Features](#12-real-time-features)
13. [Analytics](#13-analytics)
14. [Payment Simulation System](#14-payment-simulation-system)
15. [Code Robustness and Edge Cases](#15-code-robustness-and-edge-cases)
16. [API Reference Summary](#16-api-reference-summary)
17. [Deployment](#17-deployment)
18. [Current Status](#18-current-status)
19. [Challenges Faced](#19-challenges-faced)
20. [Limitations](#20-limitations)

---

## 1. Introduction

GymPulse is a live full-stack gym management platform designed to improve operational visibility in fitness centers. The system helps gyms track equipment usage, manage reservations, monitor real-time availability, and analyze usage patterns through an interactive dashboard. Unlike a basic CRUD demo, the current implementation includes authentication, analytics, real-time synchronization, and a graph database model tailored to relationship-heavy gym operations.

The project is publicly deployed and accessible online:

- **Live application:** https://gympulse-581j.onrender.com/#dashboard
- **GitHub repository:** https://github.com/Ibrahim-Fiteymi/GymPulse

---

## 2. Business Problem

Modern gyms suffer from a fundamental coordination problem: members arrive, find their preferred equipment occupied, and leave frustrated — or worse, wait without any visibility into when it will free up. Staff have no real-time picture of utilization, and management lacks data to make decisions about equipment investment or staffing hours.

**GymPulse** solves this with a full-stack gym equipment management platform:

- **Members** can see live equipment availability, reserve time slots in advance, and avoid wasted trips.
- **Admins** can manage equipment inventory, set maintenance states, and monitor usage across all equipment.
- **The system** automatically tracks usage, detects scheduling conflicts, and provides analytics on peak hours and most-used equipment — giving management actionable data.

The business domain is genuinely suited to a **graph database**: the core question ("which equipment is available right now, and who has it reserved?") maps naturally to graph traversal. Equipment nodes connect to Reservation nodes connect to Member nodes — a query that would require three JOINs in a relational database becomes a single Cypher `MATCH` pattern.

---

## 3. Proposed Solution

GymPulse solves the gym coordination problem with a web-based full-stack system that provides:

- Live equipment availability visible to all members
- Reservation management with conflict detection
- Usage tracking linked to equipment and members
- Admin analytics for operational decision-making
- Authentication for both members and admins
- Real-time data refresh via WebSocket push and polling fallback
- A deployed dashboard connected to a live backend

The goal is to improve the gym experience for members while giving administrators clear, actionable operational data.

---

## 4. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (Client)                      │
│                                                              │
│   React 19 + Vite    │   Framer Motion    │   WebSocket     │
└────────────┬─────────────────────────────────────┬──────────┘
             │ HTTP/JSON (REST)                     │ WS
             ▼                                      ▼
┌──────────────────────────────────────────────────────────────┐
│                  FastAPI (Python 3.11+)                      │
│                                                              │
│   auth.py (JWT/bcrypt)  │  schemas.py (Pydantic)            │
│   services.py (Cypher)  │  main.py (routes + startup)       │
└────────────────────────────────┬─────────────────────────────┘
                                 │ FalkorDB Python client
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│           FalkorDB (Redis-backed Graph Database)             │
│                                                              │
│   Docker container  │  Port 6379  │  Persistent volume      │
└──────────────────────────────────────────────────────────────┘
```

**Request lifecycle:**
1. React component calls a function in `api.js`
2. `api.js` attaches the JWT Bearer token and POSTs to FastAPI
3. FastAPI validates the token, runs Pydantic input validation, calls the appropriate Service method
4. The Service executes a Cypher query against FalkorDB
5. The result is serialized through the Pydantic response model and returned as JSON
6. FastAPI broadcasts a WebSocket `data_changed` event to all connected clients
7. Other open browser tabs receive the event and refresh their data

---

## 5. Technology Stack

| Layer | Technology | Version | Why |
|---|---|---|---|
| Database | **FalkorDB** | latest | Graph DB — native for relationship traversal; equipment→reservation→member queries |
| Backend framework | **FastAPI** | ≥0.100 | Async, auto-docs, native Pydantic integration, WebSocket support |
| Input validation | **Pydantic v2** | bundled | Field-level and model-level validators with detailed error messages |
| Authentication | **PyJWT + bcrypt** | ≥2.8 / ≥4.0 | HS256 JWT tokens; bcrypt for password hashing |
| Rate limiting | **slowapi** | ≥0.1.9 | Per-IP request throttling on login endpoints to prevent brute-force attacks |
| Frontend framework | **React 19** | ^19.2 | Component model, hooks, state management |
| Build tool | **Vite** | ^8.0 | Fast HMR, `publicDir` for static asset serving |
| Animations | **Framer Motion** | ^12.38 | Production-quality animation with `motion`, `AnimatePresence`, `useInView` |
| Date/time picker | **react-datepicker** | ^9.1 | 5-minute interval enforcement, min-date constraints |
| Container runtime | **Docker Compose** | 3.8 | One-command database startup with persistent volume |

---

## 6. Database — FalkorDB Graph Database

### Why FalkorDB over SQL

FalkorDB is a Redis module that implements the **openCypher graph query language** on top of a sparse adjacency matrix (GraphBLAS). Choosing it was deliberate, not cosmetic:

| Query type | SQL (relational) | FalkorDB (graph) |
|---|---|---|
| "Is Treadmill reserved right now?" | 2-table JOIN | 1 MATCH pattern |
| "Does this member have any overlapping reservation?" | Correlated subquery | Edge traversal |
| "Which equipment is most used?" | GROUP BY across 3 tables | `MATCH (r)-[:RESERVES]->(e)` aggregation |
| "Who uses the Rowing Machine?" | JOIN through usage_logs | Follow USED edges |

### Docker setup

```yaml
# docker-compose.yml
services:
  db:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"
    volumes:
      - falkordb_data:/data   # persistent across restarts
```

### Graph schema

Nodes store properties directly (no fixed schema required). Edges encode semantic relationships:

```
(:Member)-[:BOOKED_BY]-(:Reservation)-[:RESERVES]->(:Equipment)-[:LOCATED_IN]->(:GymZone)
(:Member)-[:HAS_PLAN]->(:MembershipPlan)
(:Member)-[:ENROLLED_IN]->(:WorkoutClass)<-[:LEADS]-(:Trainer)
(:UsageLog)-[:USED]->(:Equipment)
(:UsageLog)-[:LOGGED_BY]->(:Member)
(:MaintenanceTicket)-[:REPAIRS]->(:Equipment)
(:Admin)   (standalone node, no domain relationships)
```

### Cypher query examples

**Live equipment status** — "Is there an active reservation on this machine right now?":
```cypher
MATCH (e:Equipment)
OPTIONAL MATCH (r:Reservation)-[:RESERVES]->(e)
WHERE r.status = 'confirmed' AND r.start_time <= $now AND r.end_time > $now
WITH e, count(r) AS active_now
RETURN e, active_now
```

**Equipment-level conflict detection**:
```cypher
MATCH (r:Reservation {status: 'confirmed'})-[:RESERVES]->(e:Equipment)
WHERE ID(e) = $eid AND r.start_time < $end_time AND r.end_time > $start_time
RETURN count(r)
```

**Member-level double-booking detection** (via graph edge):
```cypher
MATCH (r:Reservation {status: 'confirmed'})-[:BOOKED_BY]->(m:Member)
WHERE ID(m) = $mid AND r.start_time < $end_time AND r.end_time > $start_time
RETURN count(r)
```

---

## 7. Entities and Relationships

GymPulse defines **10 domain entities** plus 1 auth entity (**11 total**):

| # | Entity | Key Properties |
|---|---|---|
| 1 | **Equipment** | name, category, zone, status, description |
| 2 | **GymZone** | name, description |
| 3 | **Member** | name, email, hashed_password, join_date |
| 4 | **Admin** | username, hashed_password |
| 5 | **MembershipPlan** | name, price_monthly, description |
| 6 | **Trainer** | name, specialty, hire_date |
| 7 | **WorkoutClass** | name, schedule_time, max_capacity |
| 8 | **MaintenanceTicket** | issue_description, status, reported_date |
| 9 | **Reservation** | start_time, end_time, status, member_name, notes |
| 10 | **UsageLog** | start_time, end_time, duration_minutes, queue_wait_minutes |

### Relationships

| Relationship | Multiplicity | Edge label |
|---|---|---|
| Member → MembershipPlan | N:1 | `HAS_PLAN` |
| Member → WorkoutClass | **M:N** | `ENROLLED_IN` |
| Trainer → WorkoutClass | 1:N | `LEADS` |
| Reservation → Equipment | N:1 | `RESERVES` |
| Reservation → Member | N:1 | `BOOKED_BY` |
| UsageLog → Equipment | N:1 | `USED` |
| UsageLog → Member | N:1 | `LOGGED_BY` |
| Equipment → GymZone | N:1 | `LOCATED_IN` |
| MaintenanceTicket → Equipment | N:1 | `REPAIRS` |

**M:N relationship highlighted:** Members and WorkoutClasses have a true many-to-many relationship encoded as `ENROLLED_IN` edges. Alice can be enrolled in multiple classes; each class can have multiple members. In a relational DB this requires a junction table — in FalkorDB it is a direct edge.

---

## 8. Backend — FastAPI

### Application structure

```
backend/
├── main.py       # App instantiation, routes, startup hooks, WebSocket
├── schemas.py    # Pydantic models (input/output DTOs)
├── services.py   # Business logic, Cypher queries
├── auth.py       # JWT creation/verification, FastAPI dependencies
└── database.py   # FalkorDB connection singleton
```

### Route categories

| Tag | Endpoints | Auth required |
|---|---|---|
| Auth | `POST /auth/admin/login`, `POST /auth/member/login` | None |
| Equipment | `GET/POST/PUT/DELETE /equipment` | Admin (write) |
| Reservations | `GET /reservations`, `POST /reservations`, `PUT /reservations/{id}` | Member or Admin |
| Usage Logs | `GET /usage-logs`, `POST /usage-logs` | Admin (write) |
| Analytics | `GET /analytics/summary`, `/most-used`, `/peak-hours` | None |
| Members | `GET /members`, `POST /members` | Public |
| Gym Zones | `GET/POST /gym-zones` | Admin (write) |
| Maintenance | `GET /maintenance-tickets` | None |
| WebSocket | `WS /ws` | JWT (query param `?token=`) |

### Startup sequence

On server start, the `lifespan` context manager runs these idempotent functions in order:

1. `_seed_data_if_empty()` — creates all 10 node types and seeded data if DB is empty
2. `_migrate_equipment_names()` — renames legacy equipment names (e.g. "Treadmill #1" → "Treadmill")
3. `_ensure_admin_exists()` — creates the admin account if missing
4. `_ensure_member_passwords()` — adds bcrypt hashes to any member nodes that lack them
5. `_ensure_diana_exists()` — creates the 4th seed member (Diana) if she doesn't exist yet
6. `_seed_peak_hour_reservations()` — seeds historical reservation data for analytics charts
7. `_align_log_times_to_5min()` — rounds seeded log end-times to 5-minute boundaries
8. `_randomize_seed_notes()` — replaces placeholder notes with realistic ones

Every function is **idempotent** — safe to run on every restart without duplicating data.

### Real-time broadcast

After every write operation (create/update/delete equipment or reservation), the route handler uses FastAPI's `BackgroundTasks` to broadcast a WebSocket event:

```python
background_tasks.add_task(ws_manager.broadcast, {"type": "data_changed"})
```

This pushes a JSON message to every connected client without blocking the HTTP response.

---

## 9. Pydantic Validation

Pydantic v2 handles all input validation at the schema layer before business logic runs.

### Field-level validation examples

```python
# Equipment — whitespace rejection via model_validator
@model_validator(mode="after")
def no_blank_required_fields(self) -> "EquipmentCreate":
    checks = {"name": self.name, "category": self.category, "zone": self.zone}
    blanks = [k for k, v in checks.items() if not v.strip()]
    if blanks:
        raise ValueError(f"These fields cannot be blank: {', '.join(blanks)}")
    return self

# Equipment — enum-style status validation
status: str = Field("available", pattern="^(available|in_use|reserved|maintenance)$")

# Reservation — time range + 60-minute cap
@model_validator(mode="after")
def validate_times(self) -> "ReservationCreate":
    if self.end_time <= self.start_time:
        raise ValueError("end_time must be strictly after start_time")
    duration_minutes = (self.end_time - self.start_time).total_seconds() / 60
    if duration_minutes > 60:
        raise ValueError("Reservation duration cannot exceed 60 minutes")
    return self

# Member — email format enforced by EmailStr
email: EmailStr

# Password — minimum 8 characters
password: str = Field(..., min_length=8)
```

### 422 error surfacing

When Pydantic rejects input, FastAPI returns a 422 response with a structured `detail` array. The frontend's `api.js` maps this into a readable message:

```javascript
if (Array.isArray(body?.detail)) {
    message = body.detail.map((e) => e.msg || JSON.stringify(e)).join("; ");
}
```

This ensures every validation error reaches the user as a clear, human-readable string.

---

## 10. Authentication and Security

### JWT tokens

- Algorithm: **HS256**
- Payload fields: `sub` (node ID), `role` (admin|member), `name` (display name), `exp`
- Expiry: **8 hours**
- Storage: `localStorage` under `gympulse_auth`

```python
def create_access_token(sub: str, role: str, name: str) -> str:
    expire  = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    payload = {"sub": sub, "role": role, "name": name, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
```

### Password hashing

All passwords are hashed with **bcrypt** (adaptive work factor) before storage. Plain-text passwords never touch the database:

```python
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
```

### Role-based access control

Two FastAPI dependency functions enforce roles at the route level:

```python
def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    return current_user

def require_member_or_admin(...) -> dict:
    # any authenticated user
```

### Ownership enforcement

Members can only cancel their own reservations. The backend verifies identity from the JWT — not from the request body:

```python
if current_user["role"] == "member":
    owner_id  = existing.get("member_id")
    caller_id = int(current_user["sub"])
    if owner_id != caller_id:
        raise HTTPException(status_code=403, detail="You can only modify your own reservations.")
```

### Rate limiting

Both login endpoints are protected with **slowapi** (per-IP, 10 requests/minute) to prevent brute-force password attacks:

```python
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/auth/admin/login", response_model=Token, tags=["Auth"])
@limiter.limit("10/minute")
def admin_login(request: Request, data: LoginRequest, graph: Graph = Depends(get_graph)):
    ...
```

A custom 429 exception handler returns a JSON body (not plain text) so the response passes CORS and is readable by the frontend:

```python
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(status_code=429,
        content={"detail": "Too many login attempts. Please wait a moment and try again."})
```

### Parameterized Cypher queries

All Cypher queries use FalkorDB's `$variable` parameter syntax — no string interpolation with user-supplied data. This eliminates Cypher injection at the query level, analogous to SQL parameterized statements:

```python
graph.query(
    "MATCH (e:Equipment) WHERE ID(e) = $id RETURN e",
    {"id": equipment_id}
)
```

### CORS

Origins restricted to the Vite dev server only — no wildcard allowed:

```python
allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"]
```

`allow_credentials=False` — auth is JWT in the Authorization header, never cookies, so no cookie CSRF risk.

### Token auto-invalidation on 401

```javascript
if (res.status === 401) {
    localStorage.removeItem("gympulse_auth");
}
```

Expired or tampered tokens are immediately cleared from localStorage, forcing re-login.

---

## 11. Frontend — React + Vite

### Component map

```
App.jsx
├── CinematicIntro.jsx     (animated splash screen, unmounts after completion)
├── Header                 (inline — nav tabs, auth display)
├── Dashboard.jsx          (live KPIs, equipment cards, charts, video hero)
│   └── Card3D.jsx         (3D CSS perspective card wrapper)
├── Reservations.jsx       (reservation form + table with status filter)
├── Admin.jsx              (equipment CRUD + completed reservations log)
├── Login.jsx              (member/admin tab switcher)
├── AboutUs.jsx            (static marketing page)
├── Membership.jsx         (plan cards → checkout)
├── Checkout.jsx           (payment sandbox — Visa/MC/PayPal)
├── ContactUs.jsx          (contact info page)
└── Footer.jsx             (nav columns + payment icons + social icons)
```

### Routing

Hash-based routing using `history.pushState` (no React Router dependency):

```javascript
const VALID_VIEWS = ["dashboard","reservations","admin","login","about","membership","contact","checkout"];

function navigate(key) {
    history.pushState(null, "", `#${key}`);   // no hashchange event — avoids double-fire
    setActiveView(key);
    window.scrollTo(0, 0);
}
```

`history.pushState` is used instead of `window.location.hash =` specifically to avoid triggering the `hashchange` listener twice — a bug that caused double-navigation requiring two clicks.

### Static asset serving

Vite is configured to serve the `pics/` folder at the root URL:

```javascript
// vite.config.js
export default defineConfig({
    plugins: [react()],
    publicDir: '../pics',   // /icon.png, /visa.png, /treadmill.png, etc.
})
```

This means all images in `pics/` are accessible as `/filename.png` in the browser without any copying or build step.

### Key React patterns used

| Pattern | Where | Purpose |
|---|---|---|
| `useState` + `useEffect` | All data components | Fetch-on-mount, poll interval, filter changes |
| `useRef` + `useInView` | Dashboard | Scroll-triggered section animations |
| `AnimatePresence` | Login, Checkout, Reservations feedback | Animate elements in/out of DOM |
| `motion.div` with `whileHover`/`whileTap` | Cards, buttons | Micro-interaction feedback |
| `performance.now()` + `requestAnimationFrame` | AnimatedNumber | Smooth counter animation without external library |
| Polling with `setInterval` | Dashboard | 15-second live refresh of all KPI data |
| WebSocket listener | `useRealtimeSync` hook | Instant push when any other tab/user changes data |

---

## 12. Real-Time Features

GymPulse implements real-time updates using **WebSocket push** combined with **HTTP polling** as a fallback:

### WebSocket server (FastAPI)

```python
class ConnectionManager:
    async def broadcast(self, payload: dict) -> None:
        dead = []
        for ws in self._connections:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)   # silent cleanup of dropped connections
```

### WebSocket client (React)

The custom `useRealtimeSync` hook maintains the WebSocket connection and calls a callback when `data_changed` arrives:

```javascript
useRealtimeSync((event) => {
    if (event.type === "data_changed") {
        setDashboardRefreshKey(k => k + 1);   // re-fetches all dashboard data
        setRemoteSyncKey(k => k + 1);          // re-fetches reservations
    }
});
```

### Polling fallback

The Dashboard independently polls every 15 seconds (`POLL_INTERVAL = 15000`) so data stays fresh even if the WebSocket drops.

---

## 13. Analytics

### KPI Summary (`/analytics/summary`)

Five live counters computed in a single Cypher pass:
- `total_equipment` — count of Equipment nodes
- `available_now` — equipment with no active confirmed reservation at this moment
- `in_use_now` — equipment with at least one active confirmed reservation
- `under_maintenance` — equipment with stored status = 'maintenance'
- `active_reservations` — confirmed reservations with a live RESERVES edge (orphaned nodes excluded)

Past reservations are automatically completed before the count runs (`_auto_complete_past`).

### Most Used Equipment (`/analytics/most-used`)

Aggregates confirmed + completed reservations per equipment, computed in Python:

```python
ranked = sorted(
    agg.items(),
    key=lambda kv: (kv[1]["sessions"], kv[1]["minutes"]),
    reverse=True
)[:limit]
```

Tie-breaking: more sessions wins; equal sessions → more total minutes wins. Cancelled reservations are excluded so cancellation is immediately reflected.

### Upcoming Reservations (Dashboard)

The dashboard "Upcoming Reservations" section fetches all confirmed reservations (`GET /reservations?status=confirmed`) and filters client-side to show only future bookings. Members can filter by:

- **Date** — a date picker defaulting to today (past dates not selectable; "Clear" shows all future dates)
- **Hour** — an optional dropdown to narrow to a specific hour of the selected day

Each row shows: member name, equipment name, start time, end time. This gives any member a real-time view of how busy the gym will be on any upcoming day.

### Peak Usage Hours (`/analytics/peak-hours`)

Counts confirmed/completed reservations per hour for a user-selected date (used internally by analytics). Server local timezone conversion is applied:

```python
dt_local = dt.astimezone()   # server local time
if date_str and dt_local.strftime("%Y-%m-%d") != date_str:
    continue
hour_map[dt_local.hour] = hour_map.get(dt_local.hour, 0) + 1
```

Returns all 24 hours as `PeakHourEntry` objects (zero-count hours included for chart rendering).


---

## 14. Payment Simulation System

GymPulse includes a full **sandbox payment flow** attached to the Membership page. It is 100% simulated — no real payment APIs are called.

### Flow

```
Membership page → select plan → Checkout page
    ↓
Choose method: [Visa] [MasterCard] [PayPal]
    ↓ (Visa/MC)                 ↓ (PayPal)
Card form                   Fake PayPal modal
    ↓                            ↓
2.4s processing animation   2.4s processing animation
    ↓                            ↓
Success / Failure screen    Success screen
    ↓
Transaction saved to localStorage
```

### Test card logic

```javascript
const TEST_CARDS = {
    "4111111111111111": "Visa",        // → success
    "5555555555554444": "MasterCard",  // → success
    // any other 16-digit card         // → declined
};
```

The card form validates format (16 digits, MM/YY expiry, 3–4 digit CVV, non-empty name) before processing. A realistic-looking transaction record is written to `localStorage` with a random transaction ID, method, amount, plan, date, and status.

All sandbox credentials are documented in `credentials.md` and removed from the UI.

---

## 15. Code Robustness and Edge Cases

### Security attack coverage

| Attack vector | Protection |
|---|---|
| Cypher injection | All queries use `$variable` parameterization — no f-string interpolation with user data |
| Brute-force login | `slowapi` rate limiter: 10 requests/minute per IP on both login endpoints |
| JWT tampering | HS256 signature verified on every request; `auto_error=False` returns clean 401 |
| Identity spoofing | Member identity injected from JWT `sub`, never read from the request body |
| Unauthorized reservation modification | Ownership enforced server-side from JWT before any write |
| Stale session reuse | 401 responses clear localStorage token, forcing re-login |
| Internal error leakage | Global 500 handler logs full trace server-side; client receives only a UUID ref — no stack traces exposed |

### Overlap detection (two layers)

**Equipment-level:** same piece of equipment cannot have two confirmed reservations with overlapping windows.

**Member-level:** same member cannot have two confirmed reservations (on any equipment) with overlapping windows — enforced via both the `BOOKED_BY` edge and the `member_id` node property as a fallback:

```python
edge_overlap  = # via BOOKED_BY graph edge
prop_overlap  = # via member_id node property
if edge_overlap > 0 or prop_overlap > 0:
    raise ValueError("You already have a reservation that overlaps this time slot.")
```

### Reservation auto-completion

`_auto_complete_past()` runs on every reservation read, marking past confirmed reservations as completed. This prevents stale "confirmed" status from polluting analytics.

### Equipment deletion safety

`DETACH DELETE` removes the equipment node and all its edges. Analytics queries require the `RESERVES` edge to exist (`MATCH (r:Reservation)-[:RESERVES]->(e:Equipment)`), so orphaned reservation nodes are automatically excluded from all counts.

### Global 500 handler

```python
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    ref = uuid.uuid4().hex[:8].upper()
    logger.exception(f"Unhandled error [ref={ref}] on {request.method} {request.url}")
    return JSONResponse(status_code=500, content={"detail": f"An internal error occurred. (ref: {ref})"})
```

Logs the full traceback server-side with a short UUID reference. The client receives a safe generic message (no internal details leaked). The reference code lets developers correlate the client-side error with server logs.

### Idempotent startup

All eight startup functions check before acting (count existing nodes, check for null fields, etc.), making server restarts safe on a populated database.

### Frontend validation mirrors backend

The reservation form validates: future start time, end > start, max 60 minutes, no overlapping confirmed reservations for this member. The backend re-validates all of these independently — the frontend validation is UX, the backend validation is security.

Members only see **future** reservations in the list — past entries are filtered out client-side (`start_time > now`) so members are not shown irrelevant historical records. Admins retain full visibility of all reservations.

### 401 token auto-clear

Expired or revoked tokens are detected on any API call and immediately cleared from localStorage, forcing re-login without user confusion.

---

## 16. API Reference Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/admin/login` | — | Admin login → JWT |
| POST | `/auth/member/login` | — | Member login → JWT |
| GET | `/equipment` | — | List all equipment with live status |
| POST | `/equipment` | Admin | Create equipment |
| PUT | `/equipment/{id}` | Admin | Update equipment |
| DELETE | `/equipment/{id}` | Admin | Delete equipment (DETACH) |
| GET | `/reservations` | — | List reservations (optional status filter) |
| POST | `/reservations` | Member/Admin | Create reservation (overlap checked) |
| PUT | `/reservations/{id}` | Member/Admin | Update/cancel reservation (ownership enforced) |
| GET | `/usage-logs` | — | List usage logs |
| POST | `/usage-logs` | Admin | Create usage log |
| GET | `/analytics/summary` | — | KPI snapshot |
| GET | `/analytics/most-used` | — | Top N equipment by sessions |
| GET | `/analytics/peak-hours` | — | Reservations per hour for a given date |
| GET | `/members` | — | List members |
| POST | `/members` | — | Register new member |
| GET | `/gym-zones` | — | List zones |
| GET | `/trainers` | — | List trainers |
| GET | `/workout-classes` | — | List classes |
| GET | `/maintenance-tickets` | — | List tickets |
| WS | `/ws` | — | Real-time push channel |

---

## 17. Deployment

### Backend Deployment

The backend was deployed on **Render** as a web service running the FastAPI application:

- A database connection issue appeared due to cloud environment constraints with FalkorDB.
- The issue was resolved by adjusting the connection settings to work within the hosted environment.
- Initial data seeding ran successfully on first startup via the idempotent `lifespan` startup functions.

### Frontend Deployment

The frontend was deployed as a **static site** on Render:

- Build command: `npm install && npm run build`
- Publish directory: `dist`
- The frontend connects dynamically to the deployed backend through the `VITE_API_URL` environment variable, set at build time on Render.

### CORS Fix

After deployment, the frontend initially failed to fetch data from the backend because the browser blocked cross-origin requests (frontend and backend hosted on different domains).

**Fix applied:**

- Updated `CORSMiddleware` in `backend/main.py` to allow the deployed frontend origin.
- Pushed the fix to GitHub.
- Redeployed using **Clear Build Cache & Deploy** on Render to pick up the change.

**Result:** The frontend and backend now communicate correctly, and the live dashboard loads server data successfully.

---

## 18. Current Status

The project is fully live:

- Frontend deployed and accessible at https://gympulse-581j.onrender.com/#dashboard
- Backend deployed and serving all API endpoints
- Dashboard loading real data from the server
- Charts pulling live analytics data
- End-to-end flow — registration, login, reservations, admin operations — fully operational

---

## 19. Challenges Faced

| Challenge | How It Was Resolved |
|---|---|
| Cloud database connectivity | Adjusted FalkorDB connection settings for the hosted environment |
| Environment-variable linking | Used `VITE_API_URL` on Render to dynamically connect frontend to backend |
| CORS restrictions in production | Updated `CORSMiddleware` to allow the deployed frontend origin |
| Deployment reliability after startup routines | Made all 8 startup functions idempotent so restarts on Render are safe |

These challenges were resolved successfully, proving the project works beyond a local development environment.

---

## 20. Limitations

| Limitation | Notes |
|---|---|
| Production hardening | Additional hardening (HTTPS-only cookies, stricter CSP headers, secrets rotation) can still be improved |
| Deployment complexity | The graph database and multi-step startup routines make cold starts slower than a simple SQL-backed service |
| Scaling | The current architecture runs a single FalkorDB instance with no read replicas or sharding — horizontal scaling would require additional infrastructure |
| Monitoring | No application performance monitoring (APM) or uptime alerting is currently in place |
