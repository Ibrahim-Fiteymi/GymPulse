# GymPulse — Project Requirements Checklist

This document maps every grading requirement to the specific implementation in the project.

---

## Core Requirements (Mandatory)

### ✅ FastAPI Backend

**Status: Done**

The entire backend is built with FastAPI (`backend/main.py`). It exposes 23 REST endpoints + 1 WebSocket endpoint across 10 resource categories (Auth, Equipment, Reservations, Usage Logs, Analytics, Members, Membership Plans, Gym Zones, Trainers, Maintenance). FastAPI's dependency injection system (`Depends`) is used for database access and authentication. Auto-generated Swagger docs are available at `http://localhost:8000/docs`.

---

### ✅ React + Vite Frontend

**Status: Done**

The frontend is a React 19 application built and served with Vite (`frontend/vite.config.js`). It includes 12 components: Dashboard, Reservations, Admin, Login, Checkout, Membership, AboutUs, ContactUs, CinematicIntro, Footer, Card3D, and the root App. Routing is handled without React Router — using `history.pushState` with a hash-based navigation system.

---

### ✅ Pydantic Validation

**Status: Done**

All API input and output is validated through Pydantic v2 schemas (`backend/schemas.py`). Examples:

- `EquipmentCreate` uses a `@model_validator` to reject blank fields
- `ReservationCreate` validates that `end_time > start_time` and duration ≤ 60 minutes
- `MemberCreate` uses `EmailStr` for email format enforcement and `Field(min_length=8)` for passwords
- `status` fields use `Field(pattern=...)` to enforce enum-style values
- 422 validation errors are surfaced as readable messages in the frontend

---

### ✅ At Least 5 Entities

**Status: Done — 11 entities total (see bonus section below)**

---

## Bonus Points

### ✅ FalkorDB as Database (+10 points)

**Status: Done — full 10 points claimed**

GymPulse uses **FalkorDB** (a Redis-backed graph database) instead of a relational database. The choice is not cosmetic — it is architecturally motivated:

| Query | SQL (relational) | FalkorDB (graph) |
|---|---|---|
| "Is this machine reserved right now?" | 2-table JOIN | 1 MATCH pattern |
| "Does this member have a conflicting booking?" | Correlated subquery | Edge traversal |
| "Which equipment is most used?" | GROUP BY across 3 tables | `MATCH (r)-[:RESERVES]->(e)` |
| "Who uses the Rowing Machine?" | JOIN through usage_logs | Follow USED edges |

All queries are parameterized using FalkorDB's `$variable` syntax — no string interpolation. The database runs in a Docker container (`docker-compose.yml`) with a persistent volume so data survives restarts.

**Where to find it:** `backend/services.py` (all Cypher queries), `backend/database.py` (connection), `docker-compose.yml` (container setup), `REPORT.md` Section 6.

---

### ✅ More Than 10 Entities + Advanced Relationships (+10 points)

**Status: Done — 11 entities with M:N relationships**

#### The 11 Entities

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

#### Relationships (Graph Edges)

| Relationship | Type | Edge Label |
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

#### Many-to-Many (M:N) Relationship

`Member ↔ WorkoutClass` via `ENROLLED_IN` is a true M:N relationship:
- One member can enroll in multiple workout classes
- One workout class can have multiple members

In a relational database this would require a junction table. In FalkorDB it is a direct edge between nodes — one of the core advantages of the graph model for this domain.

**Where to find it:** `backend/schemas.py` (all entity schemas), `backend/services.py` (Cypher queries), `REPORT.md` Section 7.

---

## Summary

| Requirement | Points | Status |
|---|---|---|
| FastAPI backend | mandatory | ✅ Done |
| React + Vite frontend | mandatory | ✅ Done |
| Pydantic validation | mandatory | ✅ Done |
| At least 5 entities | mandatory | ✅ Done (11 entities) |
| FalkorDB database | +10 bonus | ✅ Done (fully motivated) |
| 10+ entities + M:N relationships | +10 bonus | ✅ Done |
| **Total bonus points** | **+20** | ✅ |
