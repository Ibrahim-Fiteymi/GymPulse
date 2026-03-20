# GymPulse Project Report

## 1. Project title

**GymPulse: Equipment Usage Analytics, Peak-Hour Prediction, and Reservation Management System**

## 2. Business problem

Gyms usually do not know:
- which machines are used the most
- when peak hours occur
- how long members wait for equipment
- whether buying more machines is justified

This causes member frustration, uneven equipment utilization, and poor purchasing decisions.

## 3. Proposed solution

GymPulse is a web application that:
- tracks equipment usage logs
- stores reservation activity
- displays live equipment availability
- calculates wait-time and usage analytics
- estimates future busy hours from historical behavior
- provides an admin panel for machine management

## 4. Why this matches the course standards

This project was deliberately shaped around the course stack and weekly progression:
- Week 2 style backend architecture with FastAPI + SQLModel + SQLite
- Week 3 style validation, schemas, and service-layer separation
- Week 4 style React + Vite dashboard consuming backend APIs
- CORS enabled for frontend/backend communication
- Swagger docs available at `/docs`

## 5. System architecture

### Frontend
- React + Vite
- component-based UI
- dashboard tab
- reservations tab
- admin tab
- polling refresh for dashboard data

### Backend
- FastAPI routes
- SQLModel ORM models
- service layer for business logic
- SQLite persistence

### Database entities
- **Equipment**
- **UsageLog**
- **Reservation**

## 6. Core features implemented

### Equipment tracking
Every machine has:
- category
- zone
- current status
- description

### Usage analytics
The backend computes:
- total sessions per machine
- total minutes per machine
- average wait time
- historical peak hours

### Reservations
Members can:
- choose a machine
- select a time slot
- create a reservation
- cancel a reservation

Conflict detection prevents overlapping reservations for the same machine.

### Admin dashboard
Admins can:
- add new machines
- see recent logs
- inspect the current equipment inventory

## 7. Prediction approach

### Current implementation
The project includes a **baseline predictor**, not a trained ML model.

It works by:
1. grouping usage logs by day and hour
2. calculating the average number of sessions for each hour
3. labeling the hour as low, medium, or high occupancy

### Why this is honest
No real gym dataset was provided, so any claim of a trained model would be fake.

### ML-ready upgrade path
When real gym data becomes available, replace the baseline predictor with:
- CatBoost for tabular classification
- XGBoost for busy/not-busy prediction
- Stacking for balanced performance
- time-series forecasting if continuous occupancy becomes available

## 8. Suggested real dataset fields

To train a proper model later, collect:
- equipment_id
- machine category
- day_of_week
- hour_of_day
- session_duration_minutes
- queue_wait_minutes
- reservation_count_before_session
- occupancy label
- member volume per hour
- maintenance flag
- holiday/weekend flag

## 9. Example API design

### Equipment
- `GET /equipment`
- `POST /equipment`
- `PUT /equipment/{id}`
- `DELETE /equipment/{id}`

### Usage logs
- `GET /usage-logs`
- `POST /usage-logs`

### Reservations
- `GET /reservations`
- `POST /reservations`
- `PUT /reservations/{id}`

### Analytics / predictions
- `GET /analytics/summary`
- `GET /analytics/most-used`
- `GET /analytics/peak-hours`
- `GET /predictions/busy-hours`

## 10. Evaluation metrics for a future ML model

If prediction is upgraded to supervised ML, evaluate with:
- accuracy
- precision
- recall
- F1-score
- confusion matrix

If upgraded to forecasting, evaluate with:
- MAE
- RMSE
- MAPE

## 11. Limitations

- no authentication
- no websocket real-time updates
- prediction is baseline only
- sample data is seeded, not collected from a real gym
- no deployment configuration included

## 12. Next improvements

- real data collection from check-ins and sensors
- trained CatBoost/XGBoost model for busy-hour prediction
- role-based authentication for members and admins
- websocket updates for machine status changes
- calendar view for reservations
- notification system for reservation reminders

## 13. Final conclusion

GymPulse is a valid course-style project because it directly maps the business problem to a full-stack implementation using React, Vite, FastAPI, SQLModel, service-layer architecture, validation, and REST APIs. It is strong enough as a software engineering project now, and it becomes a stronger ML project later once real usage data is collected.
