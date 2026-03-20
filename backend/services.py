"""
services.py — Graph-based Business-logic layer using FalkorDB (Cypher).

This layer executes raw Cypher queries against the FalkorDB graph.
Nodes represent our 10 entities.
Edges represent relationships.
"""

from datetime import datetime, timezone
from typing import List, Optional

from falkordb import Graph

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
)

def _node_to_dict(node) -> dict:
    """Helper to merge FalkorDB internal ID with node properties."""
    data = node.properties.copy()
    data["id"] = getattr(node, "id", None)  # FalkorDB internal ID
    return data

def _format_datetime(dt: datetime) -> str:
    """Helper to convert datetime to ISO format for Cypher string storage."""
    return dt.isoformat()

def _parse_datetime(dt_str: str) -> datetime:
    """Helper to parse ISO format back to datetime."""
    return datetime.fromisoformat(dt_str)

# ═══════════════════════════════════════════════════════════════════════════
# Equipment Service
# ═══════════════════════════════════════════════════════════════════════════
class EquipmentService:
    @staticmethod
    def _live_status(stored_status: str, active_now: int) -> str:
        """Compute display status: maintenance is admin-set; otherwise derive from reservations."""
        if stored_status == "maintenance":
            return "maintenance"
        return "in_use" if active_now > 0 else "available"

    @staticmethod
    def list_all(graph: Graph, status: Optional[str] = None) -> List[dict]:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        query = """
        MATCH (e:Equipment)
        OPTIONAL MATCH (r:Reservation)-[:RESERVES]->(e)
        WHERE r.status = 'confirmed' AND r.start_time <= $now AND r.end_time > $now
        WITH e, count(r) AS active_now
        RETURN e, active_now
        """
        res = graph.query(query, {"now": now})
        results = []
        for row in res.result_set:
            eq = _node_to_dict(row[0])
            eq["status"] = EquipmentService._live_status(eq.get("status", "available"), row[1])
            if status and eq["status"] != status:
                continue
            results.append(eq)
        return results

    @staticmethod
    def get_by_id(graph: Graph, equipment_id: int) -> Optional[dict]:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        res = graph.query(
            """
            MATCH (e:Equipment) WHERE ID(e) = $id
            OPTIONAL MATCH (r:Reservation)-[:RESERVES]->(e)
            WHERE r.status = 'confirmed' AND r.start_time <= $now AND r.end_time > $now
            WITH e, count(r) AS active_now
            RETURN e, active_now
            """,
            {"id": equipment_id, "now": now},
        )
        if not res.result_set:
            return None
        eq = _node_to_dict(res.result_set[0][0])
        eq["status"] = EquipmentService._live_status(eq.get("status", "available"), res.result_set[0][1])
        return eq

    @staticmethod
    def create(graph: Graph, data: EquipmentCreate) -> dict:
        props = data.model_dump(exclude_none=True)
        res = graph.query("CREATE (e:Equipment) SET e = $props RETURN e", {"props": props})
        return _node_to_dict(res.result_set[0][0])

    @staticmethod
    def update(graph: Graph, equipment_id: int, data: EquipmentUpdate) -> Optional[dict]:
        props = data.model_dump(exclude_unset=True)
        if not props:
            return EquipmentService.get_by_id(graph, equipment_id)

        res = graph.query(
            "MATCH (e:Equipment) WHERE ID(e) = $id SET e += $props RETURN e",
            {"id": equipment_id, "props": props}
        )
        if not res.result_set: return None
        return EquipmentService.get_by_id(graph, equipment_id)

    @staticmethod
    def delete(graph: Graph, equipment_id: int) -> bool:
        # DETACH DELETE removes all relationships too
        res = graph.query("MATCH (e:Equipment) WHERE ID(e) = $id DETACH DELETE e", {"id": equipment_id})
        return res.stats.get("nodes_deleted", 0) > 0


# ═══════════════════════════════════════════════════════════════════════════
# UsageLog Service
# FIX B-09: equipment filter now uses the USED edge (ID match) instead of
#   a node property, so seeded logs (which have no equipment_id property)
#   are correctly filtered.
# FIX B-13: OPTIONAL MATCH on LOGGED_BY edge surfaces member names for
#   seeded logs that used graph edges instead of a member_name property.
# ═══════════════════════════════════════════════════════════════════════════
class UsageLogService:
    @staticmethod
    def list_all(graph: Graph, equipment_id: Optional[int] = None) -> List[dict]:
        if equipment_id:
            # FIX B-09: filter via USED edge + ID(), not a node property
            res = graph.query(
                "MATCH (u:UsageLog)-[:USED]->(e:Equipment) WHERE ID(e) = $eid "
                "OPTIONAL MATCH (u)-[:LOGGED_BY]->(m:Member) "
                "RETURN u, ID(e) AS eq_id, coalesce(u.member_name, m.name) AS member_name "
                "ORDER BY u.start_time DESC",
                {"eid": equipment_id}
            )
        else:
            res = graph.query(
                "MATCH (u:UsageLog)-[:USED]->(e:Equipment) "
                "OPTIONAL MATCH (u)-[:LOGGED_BY]->(m:Member) "
                "RETURN u, ID(e) AS eq_id, coalesce(u.member_name, m.name) AS member_name "
                "ORDER BY u.start_time DESC"
            )

        logs = []
        for row in res.result_set:
            d = _node_to_dict(row[0])
            d["equipment_id"] = row[1]
            d["member_name"] = row[2]          # FIX B-13: from edge or property
            d["start_time"] = _parse_datetime(d["start_time"])
            d["end_time"] = _parse_datetime(d["end_time"])
            logs.append(d)
        return logs

    @staticmethod
    def create(graph: Graph, data: UsageLogCreate) -> dict:
        duration = (data.end_time - data.start_time).total_seconds() / 60.0
        props = {
            "equipment_id": data.equipment_id,
            "member_id": data.member_id,
            "start_time": _format_datetime(data.start_time),
            "end_time": _format_datetime(data.end_time),
            "duration_minutes": round(duration, 2),
            "queue_wait_minutes": data.queue_wait_minutes,
        }
        # Store member_name as a node property so future reads don't need edge traversal
        if data.member_name:
            props["member_name"] = data.member_name

        res = graph.query(
            """
            MATCH (e:Equipment) WHERE ID(e) = $eid
            CREATE (u:UsageLog)-[:USED]->(e)
            SET u = $props
            RETURN u
            """,
            {"eid": data.equipment_id, "props": props}
        )
        d = _node_to_dict(res.result_set[0][0])
        d["start_time"] = _parse_datetime(d["start_time"])
        d["end_time"] = _parse_datetime(d["end_time"])
        return d


# ═══════════════════════════════════════════════════════════════════════════
# Reservation Service
# FIX B-07: overlap check now uses the RESERVES edge + ID(e) instead of
#   matching on a node property, so the seeded reservation (which has no
#   equipment_id property) is correctly detected as a conflict.
# FIX B-13: OPTIONAL MATCH on BOOKED_BY edge surfaces member names for
#   seeded reservations that used graph edges.
# ═══════════════════════════════════════════════════════════════════════════
class ReservationService:
    @staticmethod
    def _auto_complete_past(graph: Graph) -> None:
        """Mark confirmed reservations whose end_time has passed as 'completed'.

        Called at the start of every read so status is always accurate without
        a separate background job.
        """
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        graph.query(
            "MATCH (r:Reservation {status: 'confirmed'}) WHERE r.end_time < $now "
            "SET r.status = 'completed'",
            {"now": now_iso},
        )

    @staticmethod
    def list_all(graph: Graph, status: Optional[str] = None) -> List[dict]:
        ReservationService._auto_complete_past(graph)
        if status:
            res = graph.query(
                "MATCH (r:Reservation {status: $status})-[:RESERVES]->(e:Equipment) "
                "OPTIONAL MATCH (r)-[:BOOKED_BY]->(m:Member) "
                "RETURN r, ID(e) AS eq_id, coalesce(r.member_name, m.name) AS member_name "
                "ORDER BY r.start_time DESC",
                {"status": status}
            )
        else:
            res = graph.query(
                "MATCH (r:Reservation)-[:RESERVES]->(e:Equipment) "
                "OPTIONAL MATCH (r)-[:BOOKED_BY]->(m:Member) "
                "RETURN r, ID(e) AS eq_id, coalesce(r.member_name, m.name) AS member_name "
                "ORDER BY r.start_time DESC"
            )

        reservations = []
        for row in res.result_set:
            d = _node_to_dict(row[0])
            d["equipment_id"] = row[1]
            d["member_name"] = row[2]          # FIX B-13: from edge or property
            d["start_time"] = _parse_datetime(d["start_time"])
            d["end_time"] = _parse_datetime(d["end_time"])
            reservations.append(d)
        return reservations

    @staticmethod
    def get_by_id(graph: Graph, reservation_id: int) -> Optional[dict]:
        """Fetch a single reservation by its graph node ID."""
        ReservationService._auto_complete_past(graph)
        res = graph.query(
            "MATCH (r:Reservation) WHERE ID(r) = $id "
            "OPTIONAL MATCH (r)-[:RESERVES]->(e:Equipment) "
            "OPTIONAL MATCH (r)-[:BOOKED_BY]->(m:Member) "
            "RETURN r, ID(e) AS eq_id, coalesce(r.member_name, m.name) AS member_name",
            {"id": reservation_id}
        )
        if not res.result_set:
            return None
        row = res.result_set[0]
        d = _node_to_dict(row[0])
        d["equipment_id"] = row[1]
        d["member_name"]  = row[2]
        d["start_time"]   = _parse_datetime(d["start_time"])
        d["end_time"]     = _parse_datetime(d["end_time"])
        return d

    @staticmethod
    def create(
        graph: Graph,
        data: "ReservationCreate",
        auth_member_id: Optional[int] = None,
        auth_member_name: Optional[str] = None,
    ) -> dict:
        start_iso = _format_datetime(data.start_time)
        end_iso   = _format_datetime(data.end_time)

        # Reject reservations whose start time is in the past.
        # Compare against UTC now (naive). If the incoming datetime is naive,
        # treat it as UTC; if it's offset-aware, normalize to naive UTC.
        now_utc = datetime.utcnow()
        start_naive = (
            data.start_time.replace(tzinfo=None)
            if data.start_time.tzinfo is not None
            else data.start_time
        )
        if start_naive <= now_utc:
            raise ValueError("Reservation start time must be in the future.")

        # Reject reservations for equipment that is under maintenance.
        # Equipment with status 'reserved' is still bookable (it means it's
        # been reserved, not that it is physically unavailable).
        eq_res = graph.query(
            "MATCH (e:Equipment) WHERE ID(e) = $eid RETURN e.status",
            {"eid": data.equipment_id}
        )
        if not eq_res.result_set:
            raise ValueError("Equipment not found.")
        eq_status = eq_res.result_set[0][0]
        if eq_status == "maintenance":
            raise ValueError("This equipment is currently under maintenance and cannot be reserved.")

        # Equipment-level overlap: reject if this specific piece of equipment
        # already has a confirmed reservation that overlaps the requested window.
        # Uses the RESERVES edge (FIX B-07) so orphaned nodes are excluded.
        overlap_query = """
        MATCH (r:Reservation {status: 'confirmed'})-[:RESERVES]->(e:Equipment)
        WHERE ID(e) = $eid AND r.start_time < $end_time AND r.end_time > $start_time
        RETURN count(r)
        """
        overlap_res = graph.query(
            overlap_query,
            {"eid": data.equipment_id, "start_time": start_iso, "end_time": end_iso}
        )
        if overlap_res.result_set[0][0] > 0:
            raise ValueError("Time slot conflicts with an existing reservation for this equipment.")

        # Member-level overlap: reject if this member already has ANY confirmed
        # reservation (on any equipment) that overlaps the requested window.
        # Prevents double-booking even when different equipment is chosen.
        # Two queries cover both storage patterns:
        #   q1 — matches via the BOOKED_BY graph edge (used by all seeded and
        #        user-created reservations — the authoritative check)
        #   q2 — fallback: matches via the member_id property stored on the node
        #        (catches any reservation nodes that have the property but no edge)
        # Only enforced when we have a verified member ID from the JWT.
        if auth_member_id is not None:
            edge_overlap = graph.query(
                """
                MATCH (r:Reservation {status: 'confirmed'})-[:BOOKED_BY]->(m:Member)
                WHERE ID(m) = $mid
                  AND r.start_time < $end_time
                  AND r.end_time   > $start_time
                RETURN count(r)
                """,
                {"mid": auth_member_id, "start_time": start_iso, "end_time": end_iso},
            ).result_set[0][0]

            prop_overlap = graph.query(
                """
                MATCH (r:Reservation {status: 'confirmed'})
                WHERE r.member_id = $mid
                  AND r.start_time < $end_time
                  AND r.end_time   > $start_time
                RETURN count(r)
                """,
                {"mid": auth_member_id, "start_time": start_iso, "end_time": end_iso},
            ).result_set[0][0]

            if edge_overlap > 0 or prop_overlap > 0:
                raise ValueError(
                    "You already have a reservation that overlaps this time slot. "
                    "Please choose a different time."
                )

        # Build props — use the authenticated user's identity, not what the
        # client sent (prevents impersonation).
        props = {
            "equipment_id": data.equipment_id,
            "start_time":   start_iso,
            "end_time":     end_iso,
            "status":       "confirmed",
            "member_name":  auth_member_name or data.member_name or "",
        }
        if data.notes:
            props["notes"] = data.notes
        if auth_member_id is not None:
            props["member_id"] = auth_member_id

        # Create the Reservation node, the RESERVES edge, and (if a member
        # is authenticated) the BOOKED_BY edge so ownership can be verified.
        if auth_member_id is not None:
            cypher = """
            MATCH (e:Equipment) WHERE ID(e) = $eid
            MATCH (m:Member)    WHERE ID(m) = $mid
            CREATE (r:Reservation)-[:RESERVES]->(e)
            CREATE (r)-[:BOOKED_BY]->(m)
            SET r = $props
            RETURN r
            """
            res = graph.query(cypher, {
                "eid":   data.equipment_id,
                "mid":   auth_member_id,
                "props": props,
            })
        else:
            cypher = """
            MATCH (e:Equipment) WHERE ID(e) = $eid
            CREATE (r:Reservation)-[:RESERVES]->(e)
            SET r = $props
            RETURN r
            """
            res = graph.query(cypher, {"eid": data.equipment_id, "props": props})

        d = _node_to_dict(res.result_set[0][0])
        d["start_time"] = _parse_datetime(d["start_time"])
        d["end_time"]   = _parse_datetime(d["end_time"])
        return d

    @staticmethod
    def update(graph: Graph, reservation_id: int, data: ReservationUpdate) -> Optional[dict]:
        props = data.model_dump(exclude_unset=True)
        if not props:
            return ReservationService.get_by_id(graph, reservation_id)

        # Only allow updating status/notes — never start/end/equipment.
        allowed_keys = {"status", "notes"}
        props = {k: v for k, v in props.items() if k in allowed_keys}
        if not props:
            return ReservationService.get_by_id(graph, reservation_id)

        res = graph.query(
            "MATCH (r:Reservation) WHERE ID(r) = $id SET r += $props RETURN r",
            {"id": reservation_id, "props": props}
        )
        if not res.result_set:
            return None
        # Return via get_by_id so the response always includes equipment_id
        # resolved from the RESERVES edge.  Seeded reservations do not store
        # equipment_id as a node property, so reading the raw node omits it,
        # which causes FastAPI's response-model validation to raise a 500.
        return ReservationService.get_by_id(graph, reservation_id)


# ═══════════════════════════════════════════════════════════════════════════
# Simple CRUD Services for New Entities (Graph Node Creation)
# ═══════════════════════════════════════════════════════════════════════════

class GymZoneService:
    @staticmethod
    def list_all(graph: Graph) -> List[dict]:
        return [_node_to_dict(r[0]) for r in graph.query("MATCH (n:GymZone) RETURN n").result_set]
    @staticmethod
    def create(graph: Graph, data: GymZoneCreate) -> dict:
        res = graph.query("CREATE (n:GymZone) SET n = $p RETURN n", {"p": data.model_dump()})
        return _node_to_dict(res.result_set[0][0])


# FIX B-12: traverse REPAIRS edge to get equipment_id since the seeded ticket
#   stores the relationship as an edge, not a node property.
class MaintenanceTicketService:
    @staticmethod
    def list_all(graph: Graph) -> List[dict]:
        res = graph.query(
            "MATCH (n:MaintenanceTicket) "
            "OPTIONAL MATCH (n)-[:REPAIRS]->(e:Equipment) "
            "RETURN n, ID(e) AS eq_id"
        )
        results = []
        for row in res.result_set:
            d = _node_to_dict(row[0])
            # Prefer node property; fall back to edge-derived ID
            if d.get("equipment_id") is None and row[1] is not None:
                d["equipment_id"] = row[1]
            # Coerce stored ISO strings to datetime objects
            for field in ("reported_date", "resolved_date"):
                if field in d and isinstance(d[field], str):
                    d[field] = _parse_datetime(d[field])
            results.append(d)
        return results

    @staticmethod
    def create(graph: Graph, data: MaintenanceTicketCreate) -> dict:
        p = data.model_dump()
        res = graph.query(
            "MATCH (e:Equipment) WHERE ID(e)=$eid "
            "CREATE (n:MaintenanceTicket)-[:REPAIRS]->(e) SET n = $p RETURN n",
            {"eid": data.equipment_id, "p": p}
        )
        return _node_to_dict(res.result_set[0][0])


class MembershipPlanService:
    @staticmethod
    def list_all(graph: Graph) -> List[dict]:
        return [_node_to_dict(r[0]) for r in graph.query("MATCH (n:MembershipPlan) RETURN n").result_set]
    @staticmethod
    def create(graph: Graph, data: MembershipPlanCreate) -> dict:
        res = graph.query("CREATE (n:MembershipPlan) SET n = $p RETURN n", {"p": data.model_dump()})
        return _node_to_dict(res.result_set[0][0])

class MemberService:
    @staticmethod
    def list_all(graph: Graph) -> List[dict]:
        return [_node_to_dict(r[0]) for r in graph.query("MATCH (n:Member) RETURN n").result_set]

    @staticmethod
    def create(graph: Graph, data: MemberCreate) -> dict:
        from auth import hash_password
        # Check for duplicate email
        dup = graph.query(
            "MATCH (n:Member {email: $email}) RETURN count(n)",
            {"email": data.email}
        )
        if dup.result_set[0][0] > 0:
            raise ValueError("A member with this email already exists.")

        props = data.model_dump(exclude_none=True)
        plain_password = props.pop("password")
        props["hashed_password"] = hash_password(plain_password)
        props["join_date"] = datetime.utcnow().isoformat()
        res = graph.query("CREATE (n:Member) SET n = $p RETURN n", {"p": props})
        return _node_to_dict(res.result_set[0][0])

class TrainerService:
    @staticmethod
    def list_all(graph: Graph) -> List[dict]:
        return [_node_to_dict(r[0]) for r in graph.query("MATCH (n:Trainer) RETURN n").result_set]
    @staticmethod
    def create(graph: Graph, data: TrainerCreate) -> dict:
        res = graph.query("CREATE (n:Trainer) SET n = $p RETURN n", {"p": data.model_dump()})
        return _node_to_dict(res.result_set[0][0])

class WorkoutClassService:
    @staticmethod
    def list_all(graph: Graph) -> List[dict]:
        res = graph.query("MATCH (n:WorkoutClass) RETURN n")
        classes = []
        for row in res.result_set:
            d = _node_to_dict(row[0])
            d["schedule_time"] = _parse_datetime(d["schedule_time"])
            classes.append(d)
        return classes
    @staticmethod
    def create(graph: Graph, data: WorkoutClassCreate) -> dict:
        p = data.model_dump(exclude_none=True)
        p["schedule_time"] = _format_datetime(data.schedule_time)
        res = graph.query("CREATE (n:WorkoutClass) SET n = $p RETURN n", {"p": p})
        d = _node_to_dict(res.result_set[0][0])
        d["schedule_time"] = _parse_datetime(d["schedule_time"])
        return d


# ═══════════════════════════════════════════════════════════════════════════
# Analytics Service (Graph Aggregations)
# ═══════════════════════════════════════════════════════════════════════════

class AnalyticsService:
    @staticmethod
    def summary(graph: Graph) -> AnalyticsSummary:
        """Dashboard KPI snapshot using Cypher match counts."""
        ReservationService._auto_complete_past(graph)
        total = graph.query("MATCH (e:Equipment) RETURN count(e)").result_set[0][0]
        maint = graph.query("MATCH (e:Equipment {status: 'maintenance'}) RETURN count(e)").result_set[0][0]
        # Live in_use / available: count equipment with/without an active confirmed reservation right now
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        live_res = graph.query(
            """
            MATCH (e:Equipment)
            WHERE e.status <> 'maintenance'
            OPTIONAL MATCH (r:Reservation)-[:RESERVES]->(e)
            WHERE r.status = 'confirmed' AND r.start_time <= $now AND r.end_time > $now
            WITH e, count(r) AS active_now
            RETURN active_now > 0 AS is_in_use
            """,
            {"now": now},
        ).result_set
        in_use = sum(1 for row in live_res if row[0])
        avail  = sum(1 for row in live_res if not row[0])
        # Only count reservations that still have a valid RESERVES edge to an Equipment node.
        # Without this, orphaned Reservation nodes (left behind after equipment deletion) would
        # be counted, producing a non-zero value even when the equipment list is empty.
        active_res = graph.query(
            "MATCH (r:Reservation {status: 'confirmed'})-[:RESERVES]->(e:Equipment) RETURN count(r)"
        ).result_set[0][0]

        return AnalyticsSummary(
            total_equipment=total,
            available_now=avail,
            in_use_now=in_use,
            under_maintenance=maint,
            active_reservations=active_res,
        )

    @staticmethod
    def most_used(graph: Graph, limit: int = 3) -> List[MostUsedEquipment]:
        """Rank equipment by total confirmed/completed reservations.

        Source: Reservation nodes (not UsageLog).  This ensures the table
        reflects the same state that admin reservation actions modify.
        Only confirmed and completed reservations are counted; cancelled
        reservations are excluded so cancelling a booking is immediately
        reflected here.
        Duration is computed from start_time/end_time in Python because
        FalkorDB stores times as ISO strings and has no native datetime
        arithmetic.
        """
        query = """
        MATCH (r:Reservation)-[:RESERVES]->(e:Equipment)
        WHERE r.status = 'confirmed' OR r.status = 'completed'
        RETURN ID(e) AS eq_id, e.name AS eq_name,
               r.start_time AS start_t, r.end_time AS end_t
        """
        rows = graph.query(query).result_set

        # Aggregate per equipment in Python
        agg: dict = {}
        for row in rows:
            eq_id, eq_name, start_str, end_str = row
            if eq_id not in agg:
                agg[eq_id] = {"name": eq_name or "", "sessions": 0, "minutes": 0.0}
            agg[eq_id]["sessions"] += 1
            try:
                # fromisoformat in Python < 3.11 does not accept the 'Z' suffix
                start_dt = datetime.fromisoformat((start_str or "").replace("Z", "+00:00"))
                end_dt   = datetime.fromisoformat((end_str   or "").replace("Z", "+00:00"))
                # Strip tzinfo so naive and aware datetimes subtract cleanly
                start_dt = start_dt.replace(tzinfo=None)
                end_dt   = end_dt.replace(tzinfo=None)
                agg[eq_id]["minutes"] += max(0.0, (end_dt - start_dt).total_seconds() / 60.0)
            except (ValueError, TypeError, AttributeError):
                pass

        ranked = sorted(agg.items(), key=lambda kv: (kv[1]["sessions"], kv[1]["minutes"]), reverse=True)[:limit]
        return [
            MostUsedEquipment(
                equipment_id=eq_id,
                equipment_name=data["name"],
                total_sessions=data["sessions"],
                total_usage_minutes=round(data["minutes"]),
            )
            for eq_id, data in ranked
        ]

    @staticmethod
    def peak_hours(graph: Graph, date_str: Optional[str] = None) -> List[PeakHourEntry]:
        """Count reservations per hour for a specific local date.

        date_str — a YYYY-MM-DD string in server local time.  When omitted,
        all reservations are included (legacy behaviour).
        Only confirmed and completed reservations are counted; cancelled ones
        are excluded so cancellation is reflected immediately.
        Orphaned nodes (equipment deleted) are excluded by the MATCH pattern.
        """
        query = """
        MATCH (r:Reservation)-[:RESERVES]->(e:Equipment)
        WHERE r.status = 'confirmed' OR r.status = 'completed'
        RETURN r.start_time AS start_t
        """
        res = graph.query(query)
        hour_map: dict = {}
        for row in res.result_set:
            start_val = row[0]
            if not start_val:
                continue
            try:
                if isinstance(start_val, datetime):
                    dt = start_val if start_val.tzinfo else start_val.replace(tzinfo=timezone.utc)
                else:
                    dt = datetime.fromisoformat(str(start_val).replace("Z", "+00:00"))
                dt_local = dt.astimezone()          # convert to server local time
                if date_str and dt_local.strftime("%Y-%m-%d") != date_str:
                    continue
                hour_map[dt_local.hour] = hour_map.get(dt_local.hour, 0) + 1
            except (ValueError, TypeError, AttributeError):
                pass
        return [PeakHourEntry(hour=h, session_count=hour_map.get(h, 0)) for h in range(24)]


# ═══════════════════════════════════════════════════════════════════════════
# Prediction Service
# ═══════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════
# Auth Service — validates credentials against DB-stored hashes
# ═══════════════════════════════════════════════════════════════════════════

class AuthService:
    @staticmethod
    def authenticate_admin(graph: Graph, username: str, password: str) -> Optional[dict]:
        """Return the Admin node dict on success, None on failure."""
        from auth import verify_password
        res = graph.query(
            "MATCH (a:Admin {username: $u}) RETURN a",
            {"u": username}
        )
        if not res.result_set:
            return None
        admin = _node_to_dict(res.result_set[0][0])
        if not verify_password(password, admin.get("hashed_password", "")):
            return None
        return admin

    @staticmethod
    def authenticate_member(graph: Graph, email: str, password: str) -> Optional[dict]:
        """Return the Member node dict on success, None on failure."""
        from auth import verify_password
        res = graph.query(
            "MATCH (m:Member {email: $email}) RETURN m",
            {"email": email}
        )
        if not res.result_set:
            return None
        member = _node_to_dict(res.result_set[0][0])
        if not verify_password(password, member.get("hashed_password", "")):
            return None
        return member
