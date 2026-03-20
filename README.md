# GymPulse

A full-stack gym equipment tracking, availability monitoring, and reservation system built with **FastAPI** (backend) and **React + Vite** (frontend).

---

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- npm 9+

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

- Swagger docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- The database (`gympulse.db`) is auto-created and seeded on first run.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: [http://localhost:5173](http://localhost:5173)

---

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/equipment` | List all equipment (optional `?status=` filter) |
| GET | `/equipment/{id}` | Get single equipment |
| POST | `/equipment` | Add equipment |
| PUT | `/equipment/{id}` | Update equipment |
| DELETE | `/equipment/{id}` | Delete equipment |
| GET | `/usage-logs` | List usage logs (optional `?equipment_id=` filter) |
| POST | `/usage-logs` | Log a usage session |
| GET | `/reservations` | List reservations (optional `?status=` filter) |
| POST | `/reservations` | Create reservation (409 on overlap) |
| PUT | `/reservations/{id}` | Update/cancel reservation |
| GET | `/analytics/summary` | Dashboard KPI snapshot |
| GET | `/analytics/most-used` | Equipment ranked by usage |
| GET | `/analytics/peak-hours` | Sessions per hour (0–23) |

---

## Seed Data

On first startup, the backend seeds the database with:

| Data | Count | Details |
|------|-------|---------|
| Equipment | 7 | Treadmills, bench press, squat rack, rowing machine, lat pulldown, stationary bike |
| Usage Logs | ~60 | Spread across the past 7 days, realistic gym hours (6 AM–8 PM) |
| Reservations | 3 | Confirmed bookings for tomorrow |

This ensures the dashboard displays meaningful data immediately.

---

## Project Structure

```
GymPulse/
├── backend/
│   ├── main.py           # FastAPI app, routes, CORS, seed data
│   ├── database.py       # SQLite engine, session DI
│   ├── models.py         # SQLModel table definitions
│   ├── schemas.py        # Pydantic request/response validation
│   ├── services.py       # Business logic layer
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.jsx      # React entry point
│   │   ├── App.jsx       # Root component with tab navigation
│   │   ├── App.css       # Global dark-theme CSS
│   │   ├── api.js        # Backend fetch wrapper
│   │   └── components/
│   │       ├── Dashboard.jsx
│   │       ├── Reservations.jsx
│   │       └── Admin.jsx
│   ├── index.html
│   └── package.json
├── README.md
└── PROJECT_REPORT.md
```

---

## Architecture Highlights

1. **Thin Routes, Fat Services** — Route handlers only parse HTTP; all logic lives in `services.py`.
2. **Models ≠ Schemas** — DB models define storage; Pydantic schemas define API contracts with validation.
3. **Dependency Injection** — `get_session()` provides DB sessions via FastAPI's `Depends()`.
4. **15-Second Polling** — Dashboard auto-refreshes via `setInterval` in `useEffect`.

---

## License

Course project — for educational purposes.
