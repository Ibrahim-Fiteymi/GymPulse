# GymPulse

A live full-stack gym management platform built with **FastAPI** (backend), **FalkorDB** (graph database), and **React + Vite** (frontend).

- **Live application:** https://gympulse-581j.onrender.com/#dashboard
- **GitHub repository:** https://github.com/Ibrahim-Fiteymi/GymPulse

---

## What It Does

- Live equipment availability visible to all users
- Reservation management with conflict detection and ownership enforcement
- Admin panel for equipment CRUD and usage log tracking
- Analytics dashboard — KPIs, most-used equipment, peak usage hours
- Real-time updates via WebSocket push + 15-second polling fallback
- JWT authentication with role-based access (admin / member)
- Sandbox payment flow for membership plans

---

## Quick Start (Local)

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop (for FalkorDB)

### 1. Start the Database

```bash
# First time only — create the container
docker run -d -p 6379:6379 --name falkordb falkordb/falkordb:latest

# After that, just start it
docker start falkordb
```

### 2. Start the Backend

```bash
cd backend
pip install -r requirements.txt
venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

- Swagger docs: http://localhost:8000/docs
- The graph database is auto-seeded with equipment, members, reservations, and usage logs on first run.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173

---

## Seed Accounts

| Role | Username / Email | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Member | `alice@test.com` | `password123` |
| Member | `bob@test.com` | `password123` |
| Member | `charlie@test.com` | `password123` |
| Member | `diana@test.com` | `password123` |

---

## API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/admin/login` | — | Admin login → JWT |
| POST | `/auth/member/login` | — | Member login → JWT |
| GET | `/equipment` | — | List equipment (optional `?status=` filter) |
| GET | `/equipment/{id}` | — | Get single equipment |
| POST | `/equipment` | Admin | Create equipment |
| PUT | `/equipment/{id}` | Admin | Update equipment |
| DELETE | `/equipment/{id}` | Admin | Delete equipment |
| GET | `/reservations` | — | List reservations (optional `?status=` filter) |
| POST | `/reservations` | Member/Admin | Create reservation (overlap checked) |
| PUT | `/reservations/{id}` | Member/Admin | Cancel/update reservation |
| GET | `/usage-logs` | — | List usage logs (optional `?equipment_id=` filter) |
| POST | `/usage-logs` | Admin | Create usage log |
| GET | `/analytics/summary` | — | KPI snapshot |
| GET | `/analytics/most-used` | — | Top equipment by sessions (optional `?limit=`) |
| GET | `/analytics/peak-hours` | — | Sessions per hour (optional `?date=YYYY-MM-DD`) |
| GET | `/members` | — | List members |
| POST | `/members` | — | Register new member |
| GET | `/membership-plans` | — | List membership plans |
| GET | `/gym-zones` | — | List gym zones |
| POST | `/gym-zones` | Admin | Create gym zone |
| GET | `/trainers` | — | List trainers |
| GET | `/workout-classes` | — | List workout classes |
| GET | `/maintenance-tickets` | — | List maintenance tickets |
| WS | `/ws` | JWT (`?token=`) | Real-time push channel |

---

## Project Structure

```
GymPulse/
├── backend/
│   ├── main.py           # FastAPI app, routes, WebSocket, startup hooks
│   ├── database.py       # FalkorDB connection singleton
│   ├── schemas.py        # Pydantic request/response models
│   ├── services.py       # Business logic and Cypher queries
│   ├── auth.py           # JWT creation/verification, role dependencies
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx            # Root component, hash-based routing
│   │   ├── api.js             # Backend fetch wrapper with JWT injection
│   │   ├── useRealtimeSync.js # WebSocket hook
│   │   └── components/
│   │       ├── Dashboard.jsx
│   │       ├── Reservations.jsx
│   │       ├── Admin.jsx
│   │       ├── Login.jsx
│   │       ├── Membership.jsx
│   │       ├── Checkout.jsx
│   │       ├── AboutUs.jsx
│   │       ├── ContactUs.jsx
│   │       ├── Footer.jsx
│   │       ├── Card3D.jsx
│   │       ├── CinematicIntro.jsx
│   │       ├── EquipmentCard.jsx
│   │       └── MetricCard.jsx
│   ├── index.html
│   └── package.json
├── docs/
│   ├── REPORT.md
│   ├── README.md
│   ├── PROJECT_REQUIREMENTS.md
│   └── run me.md
├── pics/                  # Static assets served by Vite
├── docker-compose.yml
└── .gitignore
```

---

## Architecture Highlights

1. **Graph database** — FalkorDB (openCypher) models equipment → reservation → member relationships natively, replacing multi-table JOINs with single `MATCH` patterns.
2. **Thin routes, fat services** — Route handlers only handle HTTP concerns; all business logic and Cypher queries live in `services.py`.
3. **Real-time push** — A `ConnectionManager` broadcasts `data_changed` WebSocket events to all connected clients after every write, with 15-second polling as a fallback.
4. **JWT role-based auth** — `require_admin` and `require_member_or_admin` FastAPI dependencies enforce access at the route level; member identity is always injected from the token, never from the request body.
5. **Idempotent startup** — Eight `lifespan` functions seed and migrate data safely on every server restart.

---

## License

Course project — for educational purposes.
