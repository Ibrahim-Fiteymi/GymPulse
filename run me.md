# How to Run GymPulse (FalkorDB Graph Backend)

To run the GymPulse application, you need to start the FalkorDB database (via Docker) and the FastAPI backend server.

---

## 0. First Time? Install Docker First

If you just downloaded Docker and have never used it before:

1. Run the **Docker Desktop** installer and follow the steps.
2. **Restart your computer** when prompted.
3. Open **Docker Desktop** from the Start menu and wait until the bottom-left corner says **"Engine running"** (the whale icon turns green). This takes about 30–60 seconds.
4. If it asks you to sign in, click **Skip** — you do not need an account.
5. **Leave Docker Desktop open** in the background the entire time you are running the project. If you close it, the database stops.

> To confirm Docker is ready, open a terminal and run: `docker --version`
> If it prints a version number, you're good to go.

Then, to create the database container for the **first time ever**, run this once:

```powershell
docker run -d -p 6379:6379 -p 8001:8001 --name falkordb falkordb/falkordb:latest
```

After that, use the normal steps below (Step 1) to start/stop it.

---

## 1. Start the Database
If you recently restarted your computer, the Docker container might be stopped. Open your terminal and run:

```powershell
docker start falkordb
```

*(Note: If you ever need to recreate the database container from scratch, use: `docker run -d -p 6379:6379 -p 8001:8001 --name falkordb falkordb/falkordb:latest`)*

## 2. Start the Backend Server
Open your terminal (PowerShell or Command Prompt) and run the following commands to navigate to the backend folder and start the server using the virtual environment:

```powershell
# Go to the backend folder
cd C:\Users\obada\Desktop\GymPulse\backend

# Run the FastAPI server
venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

## 3. Test It Out!
Once the server is running, you can interact with the API by clicking the links below:

*   **API Documentation (Swagger UI) - Recommended!**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
*   **Analytics Summary Endpoint**: [http://127.0.0.1:8000/analytics/summary](http://127.0.0.1:8000/analytics/summary)
*   **Gym Zones Endpoint**: [http://127.0.0.1:8000/gym-zones](http://127.0.0.1:8000/gym-zones)

## 4. Start the Frontend
To view the user interface for GymPulse, you'll also want to start the React frontend. Open a **new, separate terminal** so the backend can keep running in your first one:

```powershell
# Go to the frontend folder
cd C:\Users\obada\Desktop\GymPulse\frontend

# Install dependencies (only needed the first time)
npm install

# Start the frontend server
npm run dev
```

Once running, your terminal will show a `"Local: http://localhost:5173/` link (or similar). Click that to open the web app!
