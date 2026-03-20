"""
schemas.py — Pydantic schemas (DTOs) for the 10-entity GymPulse API.

Separating models.py (database) from schemas.py (API input/output validation)
is a best practice that prevents leaking sensitive data and strictly controls
what clients can send/receive.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr, model_validator


# ═══════════════════════════════════════════════════════════════════════════
# Auth
# ═══════════════════════════════════════════════════════════════════════════
class LoginRequest(BaseModel):
    """Used for both admin (username) and member (email) login endpoints."""
    username: str   # admin: username string; member: email address
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str              # "admin" | "member"
    name: str              # display name shown in the UI
    member_id: Optional[int] = None  # graph node ID for members (used for ownership checks)

# ═══════════════════════════════════════════════════════════════════════════
# 1. GymZone
# ═══════════════════════════════════════════════════════════════════════════
class GymZoneBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None

class GymZoneCreate(GymZoneBase):
    pass

class GymZoneRead(GymZoneBase):
    id: int


# ═══════════════════════════════════════════════════════════════════════════
# 2. Equipment
# FIX B-05/B-06: replaced zone_id (int FK, never rendered) with zone (str),
#   so the Admin "Zone" text field is stored and returned correctly.
# ═══════════════════════════════════════════════════════════════════════════
class EquipmentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category: str = Field(..., min_length=1, max_length=50)
    status: str = Field("available", pattern="^(available|in_use|reserved|maintenance)$")
    description: Optional[str] = None
    zone: Optional[str] = None          # optional on base (EquipmentUpdate reuses it as Optional)

class EquipmentCreate(EquipmentBase):
    # zone is required when creating new equipment
    zone: str = Field(..., min_length=1, max_length=100)

    @model_validator(mode="after")
    def no_blank_required_fields(self) -> "EquipmentCreate":
        """Reject whitespace-only values for the three required string fields."""
        checks = {"name": self.name, "category": self.category, "zone": self.zone}
        blanks = [k for k, v in checks.items() if not v.strip()]
        if blanks:
            raise ValueError(f"These fields cannot be blank: {', '.join(blanks)}")
        return self

class EquipmentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    category: Optional[str] = Field(None, max_length=50)
    status: Optional[str] = Field(None, pattern="^(available|in_use|reserved|maintenance)$")
    description: Optional[str] = None
    zone: Optional[str] = None          # FIX B-05/B-06: was zone_id: Optional[int]

class EquipmentRead(EquipmentBase):
    id: int


# ═══════════════════════════════════════════════════════════════════════════
# 3. MaintenanceTicket
# FIX B-12: reported_date/resolved_date are Optional so seeded tickets
#   (which may lack these fields) don't crash Pydantic serialisation.
# ═══════════════════════════════════════════════════════════════════════════
class MaintenanceTicketBase(BaseModel):
    equipment_id: int
    issue_description: str
    status: str = Field("open", pattern="^(open|in_progress|resolved)$")

class MaintenanceTicketCreate(MaintenanceTicketBase):
    pass

class MaintenanceTicketRead(MaintenanceTicketBase):
    id: int
    reported_date: Optional[datetime] = None   # FIX B-12: was required datetime
    resolved_date: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════════════════
# 4. MembershipPlan
# ═══════════════════════════════════════════════════════════════════════════
class MembershipPlanBase(BaseModel):
    name: str
    price_monthly: float
    description: Optional[str] = None

class MembershipPlanCreate(MembershipPlanBase):
    pass

class MembershipPlanRead(MembershipPlanBase):
    id: int


# ═══════════════════════════════════════════════════════════════════════════
# 5. Member
# FIX B-10: join_date is Optional so seeded members without it don't 500.
# ═══════════════════════════════════════════════════════════════════════════
class MemberBase(BaseModel):
    name: str
    email: EmailStr
    membership_plan_id: Optional[int] = None

class MemberCreate(MemberBase):
    password: str = Field(..., min_length=8, description="Plain-text password; hashed server-side before storage")

class MemberRead(MemberBase):
    id: int
    join_date: Optional[datetime] = None       # FIX B-10: was required datetime


# ═══════════════════════════════════════════════════════════════════════════
# 6. Trainer
# FIX B-11: hire_date is Optional so seeded trainers without it don't 500.
# ═══════════════════════════════════════════════════════════════════════════
class TrainerBase(BaseModel):
    name: str
    specialty: str

class TrainerCreate(TrainerBase):
    pass

class TrainerRead(TrainerBase):
    id: int
    hire_date: Optional[datetime] = None       # FIX B-11: was required datetime


# ═══════════════════════════════════════════════════════════════════════════
# 7. WorkoutClass
# ═══════════════════════════════════════════════════════════════════════════
class WorkoutClassBase(BaseModel):
    name: str
    schedule_time: datetime
    max_capacity: int = 20
    trainer_id: Optional[int] = None

class WorkoutClassCreate(WorkoutClassBase):
    pass

class WorkoutClassRead(WorkoutClassBase):
    id: int


# ═══════════════════════════════════════════════════════════════════════════
# 8. MemberClassEnrollment
# ═══════════════════════════════════════════════════════════════════════════
class EnrollmentCreate(BaseModel):
    member_id: int
    class_id: int


# ═══════════════════════════════════════════════════════════════════════════
# 9. Reservation
# ═══════════════════════════════════════════════════════════════════════════
class ReservationBase(BaseModel):
    equipment_id: int
    member_id: Optional[int] = None
    start_time: datetime
    end_time: datetime
    status: str = Field("confirmed", pattern="^(confirmed|cancelled|completed)$")
    notes: Optional[str] = None

class ReservationCreate(ReservationBase):
    member_name: Optional[str] = None  # stored on the node for display

    @model_validator(mode="after")
    def validate_times(self) -> "ReservationCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be strictly after start_time")
        duration_minutes = (self.end_time - self.start_time).total_seconds() / 60
        if duration_minutes > 60:
            raise ValueError("Reservation duration cannot exceed 60 minutes")
        return self

class ReservationUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(confirmed|cancelled|completed)$")
    notes: Optional[str] = None

class ReservationRead(ReservationBase):
    id: int
    member_name: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════
# 10. UsageLog
# ═══════════════════════════════════════════════════════════════════════════
class UsageLogBase(BaseModel):
    equipment_id: int
    member_id: Optional[int] = None
    start_time: datetime
    end_time: datetime
    queue_wait_minutes: float = Field(0.0, ge=0.0)

class UsageLogCreate(UsageLogBase):
    member_name: Optional[str] = None  # stored on the node for display

    @model_validator(mode="after")
    def validate_times(self) -> "UsageLogCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be strictly after start_time")
        return self

class UsageLogRead(UsageLogBase):
    id: int
    duration_minutes: float
    member_name: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════
# Analytics & Predictions
# ═══════════════════════════════════════════════════════════════════════════
class AnalyticsSummary(BaseModel):
    total_equipment: int
    available_now: int
    in_use_now: int
    under_maintenance: int
    active_reservations: int

class MostUsedEquipment(BaseModel):
    equipment_id: int
    equipment_name: str
    total_sessions: int
    total_usage_minutes: int

class PeakHourEntry(BaseModel):
    hour: int
    session_count: int

