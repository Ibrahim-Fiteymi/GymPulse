Build a full-stack gym management web application called "GymPulse" from scratch. The application allows gym members to browse real-time equipment availability and make reservations, while administrators manage equipment inventory, log usage sessions, and view analytics. Use a graph database (FalkorDB) instead of a relational database to natively model the relationships between members, equipment, reservations, and usage logs. Build the project phase-by-phase as described below.

---

## Phase 1 — Graph Database Schema (FalkorDB)

1. Run a FalkorDB instance using Docker:
   ```yaml
   services:
     db:
       image: falkordb/falkordb:latest
       ports:
         - "6379:6379"
       volumes:
         - falkordb_data:/data
   volumes:
     falkordb_data:
   ```

2. Model the following 10 node types with their properties:
   - `Equipment` — `name`, `category`, `status` (available|in_use|reserved|maintenance), `description`, `zone`
   - `GymZone` — `name`, `description`
   - `Member` — `name`, `email` (unique), `hashed_password`, `join_date`
   - `Admin` — `username`, `hashed_password`
   - `MembershipPlan` — `name`, `price_monthly`, `description`
   - `Trainer` — `name`, `specialty`, `hire_date` (optional)
   - `WorkoutClass` — `name`, `schedule_time`, `max_capacity`
   - `Reservation` — `start_time`, `end_time`, `status` (confirmed|cancelled|completed), `notes`, `member_name`
   - `UsageLog` — `start_time`, `end_time`, `duration_minutes`, `queue_wait_minutes`, `member_name`
   - `MaintenanceTicket` — `issue_description`, `status` (open|in_progress|resolved), `reported_date` (optional), `resolved_date` (optional)

3. Model the following 9 typed edges between nodes:
   - `Member -[HAS_PLAN]→ MembershipPlan`
   - `Member -[ENROLLED_IN]→ WorkoutClass` *(many-to-many)*
   - `Reservation -[BOOKED_BY]→ Member`
   - `Reservation -[RESERVES]→ Equipment`
   - `Trainer -[LEADS]→ WorkoutClass`
   - `UsageLog -[USED]→ Equipment`
   - `UsageLog -[LOGGED_BY]→ Member`
   - `Equipment -[LOCATED_IN]→ GymZone`
   - `MaintenanceTicket -[REPAIRS]→ Equipment`

4. Equipment status is computed live at query time from active reservations — it is never stored as a stale property. A piece of equipment is "in_use" if at least one confirmed reservation edge exists where `start_time ≤ now < end_time`. "maintenance" is the only status set by the admin directly.

5. All Cypher queries must use parameterized `$variable` syntax. String interpolation into query strings is never allowed.

---

## Phase 2 — Backend Project Structure

1. Create a `backend/` directory with the following files:
   - `main.py` — FastAPI application, all route definitions, lifespan seeding functions
   - `services.py` — all business logic, organized into 11 service classes, each owning its Cypher queries
   - `schemas.py` — all Pydantic v2 request and response models
   - `auth.py` — JWT creation/verification, bcrypt helpers, FastAPI dependency functions
   - `database.py` — FalkorDB connection singleton and graph selection
   - `requirements.txt`

2. Python dependencies (`requirements.txt`):
   - `fastapi`, `uvicorn[standard]`, `falkordb`, `PyJWT`, `bcrypt`, `email-validator`, `slowapi`, `pydantic[email]`

3. Database connection (`database.py`):
   - Read `FALKORDB_URL` from environment (default: `redis://localhost:6379`)
   - Create a module-level FalkorDB client: `FalkorDB.from_url(FALKORDB_URL)`
   - Expose a `get_graph()` function that returns the `gympulse` named graph

4. Authentication (`auth.py`):
   - Read `SECRET_KEY` from environment — raise `RuntimeError` at startup if not set (no hardcoded default)
   - `ALGORITHM = "HS256"`, `TOKEN_EXPIRE_MINUTES = 480` (8 hours)
   - `hash_password(plain: str) -> str` — bcrypt hash
   - `verify_password(plain: str, hashed: str) -> bool` — bcrypt verify
   - `create_access_token(sub: str, role: str, name: str) -> str` — JWT with `sub` (graph node ID), `role`, `name`, `exp`
   - `get_current_user(credentials)` — decode and verify JWT; raise `401` on failure
   - `require_admin(current_user)` — raise `403` if `role != "admin"`
   - `require_member_or_admin(credentials)` — allow both roles; raise `401` if unauthenticated

---

## Phase 3 — Pydantic Schemas

1. Create all schemas in `schemas.py`. Separate request schemas from response schemas. Never reuse a model class for both.

2. Required schemas:
   - `EquipmentCreate`: `name: str`, `category: str`, `zone: str` (all required, rejecting whitespace-only via `@model_validator`), `status: str = "available"`, `description: Optional[str]`
   - `EquipmentRead`: `id: int`, `name`, `category`, `status`, `zone`, `description`
   - `ReservationCreate`: `equipment_id: int`, `start_time: datetime`, `end_time: datetime`, `notes: Optional[str]`, `member_name: Optional[str]`; add `@model_validator` enforcing `end_time > start_time` and `(end_time - start_time) ≤ 60 minutes`
   - `ReservationRead`: `id`, `equipment_id`, `member_id`, `start_time`, `end_time`, `status`, `notes`, `member_name`
   - `ReservationUpdate`: `status: Optional[str]`, `notes: Optional[str]`
   - `UsageLogCreate`: `equipment_id: int`, `member_id: Optional[int]`, `start_time: datetime`, `end_time: datetime`, `queue_wait_minutes: Optional[int] = 0`, `member_name: Optional[str]`
   - `UsageLogRead`: `id`, `equipment_id`, `member_id`, `start_time`, `end_time`, `duration_minutes`, `queue_wait_minutes`, `member_name`
   - `MemberCreate`: `name: str`, `email: EmailStr`, `password: str = Field(min_length=8)`, `membership_plan_id: Optional[int]`
   - `MemberRead`: `id`, `name`, `email`, `membership_plan_id`, `join_date`
   - `AdminLoginRequest`: `username: str`, `password: str`
   - `MemberLoginRequest`: `username: EmailStr`, `password: str`
   - `TokenResponse`: `access_token: str`, `token_type: str = "bearer"`, `role: str`, `name: str`
   - `AnalyticsSummary`: `total_equipment`, `available_now`, `in_use_now`, `under_maintenance`, `active_reservations`
   - `MostUsedEquipment`: `equipment_id`, `equipment_name`, `total_sessions`, `total_usage_minutes`
   - `PeakHour`: `hour: int`, `session_count: int`
   - Additional read schemas for `GymZone`, `MembershipPlan`, `Trainer`, `WorkoutClass`, `MaintenanceTicket`

---

## Phase 4 — Service Layer

1. Create `services.py`. All Cypher queries must live in this file. Routes must never execute Cypher directly.

2. Organize logic into 11 service classes. Each class receives a FalkorDB graph object and owns its query strings.

3. `EquipmentService`:
   - `list_equipment(status_filter)` — MATCH all Equipment nodes; for each compute live status via OPTIONAL MATCH on active Reservation RESERVES edges; optionally filter by status
   - `get_equipment(id)` — fetch single node by ID; raise `404` if not found
   - `create_equipment(data)` — CREATE node with all properties; return new node
   - `update_equipment(id, data)` — SET only provided fields; raise `404` if not found
   - `delete_equipment(id)` — DETACH DELETE; removes all connected edges automatically

4. `ReservationService`:
   - `create_reservation(data, member_id)`:
     * Reject if target equipment status is `maintenance`
     * Reject if `start_time` is in the past (UTC comparison)
     * Equipment-level overlap check: MATCH any confirmed Reservation RESERVES the same Equipment where `start_time < end_time AND end_time > start_time`; raise `409` if any exist
     * Member-level overlap check: MATCH any confirmed Reservation BOOKED_BY the same Member where times overlap; raise `409` if any exist
     * CREATE Reservation node; CREATE RESERVES edge to Equipment; CREATE BOOKED_BY edge to Member if member_id is provided
   - `list_reservations(status_filter)` — MATCH all Reservations with optional status filter; auto-complete any confirmed reservations whose end_time has passed
   - `update_reservation(id, data, current_user)`:
     * Verify ownership: traverse BOOKED_BY edge; if member role and not owner, raise `403`
     * Block cancellation if `start_time < now`
     * SET allowed fields only (status, notes); start_time, end_time, equipment_id are immutable after creation

5. `UsageLogService`:
   - `create_usage_log(data)` — CREATE UsageLog node; compute `duration_minutes` from `end_time - start_time`; CREATE USED edge to Equipment; CREATE LOGGED_BY edge to Member if provided
   - `list_usage_logs(equipment_id_filter)` — MATCH all UsageLogs; optionally filter via USED edge + `ID(e) = $eid`

6. `AnalyticsService`:
   - `get_summary()` — count total Equipment; count Equipment without active reservations and not in maintenance (available_now); count Equipment with active confirmed reservations (in_use_now); count Equipment with status=maintenance; count confirmed Reservations with valid RESERVES edge
   - `get_most_used(limit)` — count confirmed+completed Reservations per Equipment; compute `total_usage_minutes` in Python (FalkorDB has no datetime arithmetic); sort descending
   - `get_peak_hours(date)` — count Reservations per hour (0–23) for the given date; return all 24 hours including zeros

7. `AuthService`:
   - `admin_login(username, password)` — MATCH Admin node by username; verify bcrypt; return JWT with `role="admin"`
   - `member_login(email, password)` — MATCH Member node by email; verify bcrypt; return JWT with `role="member"` and `member_id`

8. Remaining service classes (`GymZoneService`, `MemberService`, `MembershipPlanService`, `TrainerService`, `WorkoutClassService`, `MaintenanceTicketService`) — standard CRUD with Cypher MATCH / CREATE / SET / DETACH DELETE patterns.

---

## Phase 5 — FastAPI Routing Layer

Thin routes: every route body must be 3–5 lines — validate the request, call the service, return the result. No Cypher inside route functions.

1. `main.py`:
   - Create `app = FastAPI(title="GymPulse API")`
   - Add `CORSMiddleware` with `allow_origins=["*"]`, `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`
   - Add `slowapi` rate limiter: 10 requests/minute on both login endpoints, 5 requests/minute on member registration
   - Use `@asynccontextmanager` lifespan to run 8 idempotent startup seed functions (see Phase 6)
   - Add a WebSocket connection manager that broadcasts `{ "type": "data_changed" }` to all connected clients as a background task after every equipment or reservation mutation

2. Implement the following 24 endpoints:

   **Auth (rate-limited)**
   - `POST /auth/admin/login` (10/min) → `TokenResponse`
   - `POST /auth/member/login` (10/min) → `TokenResponse`

   **Equipment** (reads public, writes admin-only)
   - `GET /equipment?status=` → `list[EquipmentRead]`
   - `GET /equipment/{id}` → `EquipmentRead`
   - `POST /equipment` (admin) → `EquipmentRead`, `201`
   - `PUT /equipment/{id}` (admin) → `EquipmentRead`
   - `DELETE /equipment/{id}` (admin) → `204`

   **Reservations** (member or admin)
   - `GET /reservations?status=` → `list[ReservationRead]`
   - `POST /reservations` → `ReservationRead`, `201`
   - `PUT /reservations/{id}` → `ReservationRead`

   **Usage Logs**
   - `GET /usage-logs?equipment_id=` → `list[UsageLogRead]`
   - `POST /usage-logs` (admin) → `UsageLogRead`, `201`

   **Analytics**
   - `GET /analytics/summary` → `AnalyticsSummary`
   - `GET /analytics/most-used?limit=` → `list[MostUsedEquipment]`
   - `GET /analytics/peak-hours?date=YYYY-MM-DD` → `list[PeakHour]`

   **Members** (registration public)
   - `GET /members` → `list[MemberRead]`
   - `POST /members` (5/min rate limit) → `MemberRead`, `201`

   **Other read-only endpoints**
   - `GET /membership-plans` → list
   - `GET /gym-zones` → list
   - `POST /gym-zones` (admin) → zone, `201`
   - `GET /trainers` → list
   - `GET /workout-classes` → list
   - `GET /maintenance-tickets` → list

   **WebSocket**
   - `WS /ws?token={jwt}` — authenticate on connect; push `{ "type": "data_changed" }` after every mutation

3. HTTP status code reference:
   - `200` — successful read
   - `201` — resource created
   - `204` — resource deleted
   - `400` — business rule violation (past time, maintenance equipment)
   - `401` — missing or invalid JWT
   - `403` — insufficient role
   - `404` — resource not found
   - `409` — reservation overlap conflict
   - `422` — Pydantic validation failure (automatic)
   - `429` — rate limit exceeded

---

## Phase 6 — Database Seeding (Idempotent Startup Functions)

All 8 functions run on every server start inside the FastAPI lifespan. Each must be idempotent — check before inserting, never duplicate data.

1. `_seed_data_if_empty()` — if the graph has no Equipment nodes, create all initial data:
   - 3 GymZones: Cardio Floor, Free Weights, Yoga Studio
   - 5 Equipment: Treadmill (Cardio, Cardio Floor), Elliptical (Cardio, Cardio Floor, in_use), Bench Press (Strength, Free Weights), Squat Rack (Strength, Free Weights), Rowing Machine (Cardio, Cardio Floor, maintenance)
   - 4 Members: Alice (alice@test.com), Bob (bob@test.com), Charlie (charlie@test.com) — all password `password123`
   - 2 MembershipPlans: Basic ($29.99), Premium ($59.99)
   - 2 Trainers: Sarah Connor (HIIT), Arnold S. (Strength)
   - 2 WorkoutClasses with LEADS edges
   - 1 seeded Reservation: Alice → Treadmill, tomorrow 09:00–10:00, confirmed
   - 56 UsageLogs over the past 7 days (8 per day, peak hours: 7am, 8am, 12pm, 5pm, 6pm, 7pm; duration 20–45 min)
   - 1 MaintenanceTicket: Rowing Machine, "Broken chain", open

2. `_ensure_admin_exists()` — CREATE Admin node with username=`admin`, bcrypt hash of `admin123`, if none exists

3. `_ensure_diana_exists()` — CREATE 4th Member diana@test.com if she doesn't exist

4. `_ensure_member_passwords()` — for any Member node missing `hashed_password`, add bcrypt hash of `password123`

5. `_migrate_equipment_names()` — rename any legacy equipment names (e.g. "Treadmill #1" → "Treadmill")

6. `_seed_peak_hour_reservations()` — CREATE 30 future confirmed Reservations spread across different hours for analytics testing, if fewer than 20 future Reservations exist

7. `_align_log_times_to_5min()` — round all UsageLog `end_time` values to the nearest 5-minute boundary

8. `_randomize_seed_notes()` — assign realistic workout notes to any Reservation with a placeholder note string

---

## Phase 7 — React + Vite Frontend

1. Create a `frontend/` directory. Initialise with:
   ```
   npm create vite@latest frontend -- --template react
   cd frontend && npm install
   npm install framer-motion react-datepicker
   ```

2. Design system — dark glassmorphism theme:
   - Page background: deep dark (`#0a0a0a` or similar)
   - Glass card: `background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px`
   - Status pill colours: available (green `#22c55e`), in_use (blue `#3b82f6`), reserved (amber `#f59e0b`), maintenance (red `#ef4444`)
   - Accent: white/light text on dark backgrounds
   - Framer Motion: `whileHover={{ scale: 1.02 }}`, `whileTap={{ scale: 0.98 }}`, staggered fade-in-up on list items

3. API client (`src/api.js`):
   - Read base URL from `import.meta.env.VITE_API_URL` (fallback: `http://127.0.0.1:8000`)
   - All requests attach `Authorization: Bearer {token}` from `localStorage.getItem("gympulse_auth")`
   - `401` responses clear the stored token
   - `422` responses extract and join the Pydantic detail array into a readable string
   - `429` responses surface the rate-limit message
   - Export named functions for every endpoint: `loginAdmin`, `loginMember`, `logout`, `getEquipment`, `createEquipment`, `updateEquipment`, `deleteEquipment`, `getReservations`, `createReservation`, `updateReservation`, `cancelReservation`, `getUsageLogs`, `createUsageLog`, `getAnalyticsSummary`, `getMostUsed`, `getPeakHours`, `getMembers`

4. Real-time sync hook (`src/useRealtimeSync.js`):
   - Open WebSocket to `/ws?token={jwt}` on mount
   - Parse incoming JSON; call provided callback on `type === "data_changed"`
   - Auto-reconnect every 3 seconds on drop
   - Close socket cleanly on unmount

5. Create the following 13 components in `src/components/`:

   - `CinematicIntro.jsx` — animated splash screen on first load; unmounts after animation completes
   - `Dashboard.jsx`:
     * Poll `getAnalyticsSummary`, `getEquipment`, `getMostUsed` every 15 seconds independently of WebSocket
     * Display 5 KPI metric cards: Total Equipment, Available Now, In Use, Active Reservations, Under Maintenance
     * Equipment grid with `EquipmentCard` components showing live status
     * Upcoming reservations section: filter by date + optional hour
     * Hero section with video background and overlay text
   - `Admin.jsx`:
     * Equipment inventory table: ID, Name, Category, Zone, Status, Edit/Delete actions
     * Add/Edit inline form: Name, Category, Zone, Status, Description
     * Delete requires `window.confirm`
     * Usage log creation form: Equipment selector, Member selector, start/end time, queue wait
     * Toast feedback on success/error (auto-dismiss 5 seconds)
   - `Reservations.jsx`:
     * Create reservation form: Equipment dropdown (maintenance items disabled), date/time picker (5-minute intervals via react-datepicker), auto-calculated end time from duration selector, Notes field
     * Reservation list filtered by status (confirmed, cancelled, completed)
     * Cancel button calls `PUT /reservations/{id}` with `{ status: "cancelled" }`
   - `Login.jsx` — two tabs: Member (email/password) and Admin (username/password); rate-limit error feedback
   - `Membership.jsx` — 4 static plan cards (Day Pass $10, Monthly $49, Quarterly $129, Yearly $399) with feature lists and CTA buttons
   - `Checkout.jsx`:
     * Card form: number (formatted, 16 digits), name, expiry (MM/YY), CVV
     * Test cards: `4111111111111111` → Visa success, `5555555555554444` → Mastercard success, any other → failure
     * Processing animation (2.4-second delay) → success or failure screen
     * Transactions saved to `localStorage` with random ID
     * PayPal demo modal option
   - `AboutUs.jsx` — marketing page
   - `ContactUs.jsx` — contact information page
   - `Footer.jsx` — navigation links, payment method icons, social links
   - `EquipmentCard.jsx` — displays category, name, status pill, zone, description; uses status colours
   - `MetricCard.jsx` — animated KPI card with counter
   - `Card3D.jsx` — CSS perspective wrapper for 3D hover effect on dashboard cards

6. `App.jsx` — root component using hash-based routing:
   ```
   #dashboard     → Dashboard       (public)
   #reservations  → Reservations    (any authenticated)
   #admin         → Admin           (admin only)
   #login         → Login           (public)
   #membership    → Membership      (public)
   #checkout      → Checkout        (public)
   #about         → AboutUs         (public)
   #contact       → ContactUs       (public)
   ```
   - Auth state read from `localStorage` on mount
   - `useRealtimeSync` hook wired to trigger data refreshes across components
   - `Header` component with nav tabs and auth badge (shows logged-in user name and role)

---

## Phase 8 — Repository Structure and Documentation

1. Final repository structure:
   ```
   GymPulse/
   ├── backend/
   │   ├── main.py
   │   ├── services.py
   │   ├── schemas.py
   │   ├── auth.py
   │   ├── database.py
   │   └── requirements.txt
   ├── frontend/
   │   ├── src/
   │   │   ├── main.jsx
   │   │   ├── App.jsx
   │   │   ├── api.js
   │   │   ├── useRealtimeSync.js
   │   │   └── components/
   │   ├── package.json
   │   └── vite.config.js
   ├── docs/
   │   ├── README.md
   │   ├── REPORT.md
   │   └── PROJECT_REQUIREMENTS.md
   ├── prompts/
   │   └── prompts.md
   ├── docker-compose.yml
   └── .gitignore
   ```

2. `README.md` must include:
   - Project description and tech stack table
   - How to run locally (Docker for FalkorDB, `uvicorn main:app --reload` for backend, `npm run dev` for frontend)
   - Environment variables: `FALKORDB_URL`, `SECRET_KEY`, `VITE_API_URL`
   - Seed accounts table (admin, alice, bob, charlie, diana)
   - Live deployment URLs

3. `REPORT.md` must cover:
   - Business problem and solution overview
   - Why FalkorDB (graph database) over a relational database — cite specific queries where edges replace JOINs
   - Full project structure tree
   - Security measures (parameterized Cypher, JWT, bcrypt, rate limiting, ownership enforcement, no secret in browser)
   - API endpoint reference table
   - Deployment section (Render for both frontend and backend)
   - Known limitations and future improvements

---

## Architectural Principles

These rules apply to every file in the project:

- **Thin routes, fat services:** Every route body is 3–5 lines — parse the request, call one service method, return the result. No Cypher inside route functions.
- **Parameterized queries:** All Cypher uses `$variable` substitution. String interpolation into query strings is forbidden.
- **Computed status:** Equipment status is derived from live reservation data at query time, never stored as potentially stale state.
- **Two-layer overlap prevention:** Reservation creation checks both equipment-level and member-level conflicts separately.
- **Ownership via edges:** Member identity for authorization is always read from the `BOOKED_BY` edge traversal, never trusted from the request body.
- **Idempotent seeding:** All 8 startup functions safely re-run on every server restart without duplicating data.
- **No secrets in browser:** `SECRET_KEY` is never sent to the client. `FALKORDB_URL` is a server-only environment variable. Only `VITE_API_URL` is exposed to the frontend build.
- **Auto-reconnect WebSocket:** The frontend retries the WebSocket connection every 3 seconds on drop, with a 15-second polling fallback on the Dashboard.
- **Error isolation:** 500 errors log the full traceback server-side; the client receives only a UUID error reference to prevent internal leakage.

---

EXPECTED RESULT:
- FastAPI backend running on `localhost:8000` with interactive Swagger docs at `/docs`
- React frontend running on `localhost:5173` with dark glassmorphic UI and Framer Motion animations
- FalkorDB running in Docker on `localhost:6379` with persistent volume
- Anonymous users can view real-time equipment availability and analytics on the Dashboard
- Authenticated members can create and cancel reservations with full overlap protection
- Admin users can manage equipment, log usage sessions, and view detailed analytics
- WebSocket push ensures all connected clients see data updates within milliseconds
- The repository contains `REPORT.md`, `README.md`, `prompts/`, and `docs/` ready for submission
