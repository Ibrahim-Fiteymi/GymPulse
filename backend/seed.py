"""
seed.py — GymPulse
-------------------
Populates the database with realistic starter data so the dashboard is
non-empty on first run.

Equipment: 8 machines across three zones.
Usage logs: ~1 week of sessions with realistic patterns
            (busy mornings/evenings, quieter afternoons).
Reservations: a handful of upcoming bookings.

Run this once after `create_db_and_tables()` is called.
It is idempotent: if equipment already exists, it skips seeding.
"""

from datetime import datetime, timedelta
import random
from sqlmodel import Session, select
from models import Equipment, UsageLog, Reservation


EQUIPMENT_SEED = [
    {"name": "Treadmill #1",        "category": "Cardio",    "zone": "Zone A", "status": "available",    "description": "Commercial-grade treadmill, max 20 km/h"},
    {"name": "Treadmill #2",        "category": "Cardio",    "zone": "Zone A", "status": "in_use",       "description": "Commercial-grade treadmill, max 20 km/h"},
    {"name": "Rowing Machine",      "category": "Cardio",    "zone": "Zone A", "status": "available",    "description": "Concept2 Model D"},
    {"name": "Bench Press Station", "category": "Strength",  "zone": "Zone B", "status": "available",    "description": "Olympic barbell + adjustable bench"},
    {"name": "Squat Rack",          "category": "Strength",  "zone": "Zone B", "status": "reserved",     "description": "Power rack with safety bars"},
    {"name": "Cable Machine",       "category": "Strength",  "zone": "Zone B", "status": "available",    "description": "Dual-stack cable crossover"},
    {"name": "Spin Bike #1",        "category": "Cardio",    "zone": "Zone C", "status": "available",    "description": "Keiser M3i indoor cycle"},
    {"name": "Leg Press Machine",   "category": "Strength",  "zone": "Zone C", "status": "maintenance",  "description": "Plate-loaded leg press — under maintenance"},
]


def _busy_hours_for_day(base_date: datetime) -> list:
    """Return (hour, minute) tuples representing realistic session start times."""
    slots = []
    # Morning rush: 6–9 am
    for _ in range(random.randint(4, 8)):
        slots.append((random.randint(6, 8), random.randint(0, 59)))
    # Midday: 11 am – 1 pm (light)
    for _ in range(random.randint(1, 3)):
        slots.append((random.randint(11, 13), random.randint(0, 59)))
    # Evening rush: 5–8 pm
    for _ in range(random.randint(5, 10)):
        slots.append((random.randint(17, 20), random.randint(0, 59)))
    return slots


def seed_database(session: Session) -> None:
    # Idempotency check
    existing = session.exec(select(Equipment)).first()
    if existing:
        return

    # ── Equipment ──
    equipment_objects = []
    for e in EQUIPMENT_SEED:
        obj = Equipment(**e)
        session.add(obj)
        equipment_objects.append(obj)
    session.flush()

    # Re-fetch to get auto-assigned IDs
    equipment_objects = session.exec(select(Equipment)).all()
    eq_ids = [e.id for e in equipment_objects if e.status != "maintenance"]

    # ── Usage Logs (past 7 days) ──
    members = [
        "Alice Yılmaz", "Bob Chen", "Carlos Rivera", "Diana Müller",
        "Ethan Park", "Fatma Demir", "George Brown", "Hana Sato",
    ]
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    for day_offset in range(7, 0, -1):
        base = today - timedelta(days=day_offset)
        slots = _busy_hours_for_day(base)
        for (hour, minute) in slots:
            eq_id = random.choice(eq_ids)
            start = base.replace(hour=hour, minute=minute)
            duration = random.randint(20, 75)    # minutes
            end = start + timedelta(minutes=duration)
            wait = round(random.uniform(0, 15), 1)
            log = UsageLog(
                equipment_id=eq_id,
                member_name=random.choice(members),
                start_time=start,
                end_time=end,
                duration_minutes=float(duration),
                queue_wait_minutes=wait,
            )
            session.add(log)

    # ── Reservations (next 2 days) ──
    tomorrow = today + timedelta(days=1)
    day_after = today + timedelta(days=2)

    upcoming = [
        Reservation(
            equipment_id=eq_ids[0],
            member_name="Alice Yılmaz",
            start_time=tomorrow.replace(hour=7, minute=0),
            end_time=tomorrow.replace(hour=7, minute=45),
            status="confirmed",
            notes="Morning cardio session",
        ),
        Reservation(
            equipment_id=eq_ids[1] if len(eq_ids) > 1 else eq_ids[0],
            member_name="Carlos Rivera",
            start_time=tomorrow.replace(hour=18, minute=0),
            end_time=tomorrow.replace(hour=18, minute=30),
            status="confirmed",
            notes=None,
        ),
        Reservation(
            equipment_id=eq_ids[2] if len(eq_ids) > 2 else eq_ids[0],
            member_name="Diana Müller",
            start_time=day_after.replace(hour=9, minute=0),
            end_time=day_after.replace(hour=10, minute=0),
            status="confirmed",
            notes="Strength training",
        ),
    ]
    for r in upcoming:
        session.add(r)

    session.flush()
    print("✅  Database seeded with equipment, usage logs, and reservations.")
