"""
models.py — GymPulse
---------------------
Defines the *database* tables using SQLModel.

WHY SEPARATE FROM SCHEMAS?
  - These classes mirror the physical SQLite tables (columns, types, defaults).
  - Schemas (schemas.py) define what the API accepts/returns, including
    computed fields, validation rules, and data reshaping.
  - Keeping them separate means you can evolve the DB schema independently
    from the API contract, and vice-versa.

SQLModel combines SQLAlchemy ORM with Pydantic; setting `table=True`
tells SQLModel to register the class as a real DB table.
"""

from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


# ──────────────────────────────────────────
# Equipment
# ──────────────────────────────────────────

class Equipment(SQLModel, table=True):
    """
    Represents a single piece of gym equipment.

    Zones allow mapping to physical gym areas (e.g. "Cardio Floor", "Free Weights").
    Categories allow grouping (e.g. "Cardio", "Strength", "Flexibility").
    """
    __tablename__ = "equipment"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)                  # e.g. "Treadmill #3"
    category: str                                   # e.g. "Cardio"
    zone: str                                       # e.g. "Zone A"
    status: str = Field(default="available")        # available | in_use | reserved | maintenance
    description: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ──────────────────────────────────────────
# UsageLog
# ──────────────────────────────────────────

class UsageLog(SQLModel, table=True):
    """
    Records a completed usage session for a piece of equipment.

    duration_minutes and queue_wait_minutes are stored (not computed on the fly)
    so that analytics queries remain simple SQL aggregations.
    """
    __tablename__ = "usage_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    equipment_id: int = Field(foreign_key="equipment.id", index=True)
    member_name: str
    start_time: datetime
    end_time: datetime
    duration_minutes: float                         # Computed by service from start/end
    queue_wait_minutes: float = Field(default=0.0)  # How long the member waited
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ──────────────────────────────────────────
# Reservation
# ──────────────────────────────────────────

class Reservation(SQLModel, table=True):
    """
    Represents a future booking for a piece of equipment.

    status lifecycle:  confirmed → cancelled
                                 → completed  (set when a usage log is created)
    """
    __tablename__ = "reservation"

    id: Optional[int] = Field(default=None, primary_key=True)
    equipment_id: int = Field(foreign_key="equipment.id", index=True)
    member_name: str
    start_time: datetime
    end_time: datetime
    status: str = Field(default="confirmed")        # confirmed | cancelled | completed
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
