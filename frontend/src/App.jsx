import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Dashboard       from "./components/Dashboard";
import Reservations    from "./components/Reservations";
import Admin           from "./components/Admin";
import Login           from "./components/Login";
import CinematicIntro  from "./components/CinematicIntro";
import Footer           from "./components/Footer";
import AboutUs          from "./components/AboutUs";
import Membership       from "./components/Membership";
import ContactUs        from "./components/ContactUs";
import Checkout         from "./components/Checkout";
import { getStoredAuth, logout } from "./api";
import { useRealtimeSync } from "./useRealtimeSync";
import "./App.css";

const VALID_VIEWS = ["dashboard", "reservations", "admin", "login", "about", "membership", "contact", "checkout"];

const NAV_VIEWS = [
  { key: "dashboard",    label: "Dashboard",    icon: "◈" },
  { key: "reservations", label: "Reservations", icon: "⊞" },
];

function getViewFromHash() {
  const hash = window.location.hash.slice(1);
  return VALID_VIEWS.includes(hash) ? hash : "dashboard";
}

export default function App() {
  const [introDone,  setIntroDone]  = useState(false);
  const [activeView, setActiveView] = useState(getViewFromHash);
  const [auth,       setAuth]       = useState(() => getStoredAuth());
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [remoteSyncKey,       setRemoteSyncKey]       = useState(0);
  const [selectedPlan,        setSelectedPlan]        = useState(null);

  function triggerDashboardRefresh() { setDashboardRefreshKey(k => k + 1); }

  function handleSelectPlan(plan) {
    setSelectedPlan(plan);
    navigate("checkout");
  }

  useRealtimeSync((event) => {
    if (event.type === "data_changed") {
      setDashboardRefreshKey(k => k + 1);
      setRemoteSyncKey(k => k + 1);
    }
  });

  useEffect(() => {
    function handleHashChange() { setActiveView(getViewFromHash()); }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function navigate(key) {
    history.pushState(null, "", `#${key}`);
    setActiveView(key);
    window.scrollTo(0, 0);
  }

  function handleLogin(result) {
    setAuth({ token: result.access_token, role: result.role, name: result.name, member_id: result.member_id });
    navigate(result.role === "admin" ? "admin" : "reservations");
  }

  function handleLogout() {
    logout();
    setAuth(null);
    navigate("dashboard");
  }

  return (
    <>
      {/* Cinematic intro — sits above everything, fades out then unmounts */}
      <AnimatePresence>
        {!introDone && (
          <CinematicIntro onDone={() => setIntroDone(true)} />
        )}
      </AnimatePresence>

      <div className="app">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="app-header">
          <div className="header-brand">
            <img src="/icon.png" alt="GymPulse" className="brand-icon" />
            <h1>GymPulse</h1>
          </div>

          <nav className="nav-tabs">
            {NAV_VIEWS.map(v => (
              <button
                key={v.key}
                className={`nav-tab ${activeView === v.key ? "active" : ""}`}
                onClick={() => navigate(v.key)}
              >
                <span className="nav-icon">{v.icon}</span>
                {v.label}
              </button>
            ))}

            {auth?.role === "admin" && (
              <button
                className={`nav-tab ${activeView === "admin" ? "active" : ""}`}
                onClick={() => navigate("admin")}
              >
                <span className="nav-icon">⚙</span>
                Admin
              </button>
            )}
          </nav>

          <div className="header-auth">
            {auth ? (
              <>
                <span className="user-info">
                  <span className="user-role-badge">{auth.role}</span>
                  {auth.name}
                </span>
                <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
                  Sign Out
                </button>
              </>
            ) : (
              <button
                className={`nav-tab ${activeView === "login" ? "active" : ""}`}
                onClick={() => navigate("login")}
              >
                <span className="nav-icon">⊙</span>
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* ── Main ────────────────────────────────────────────────── */}
        <main className="app-main">
          {/* Dashboard always mounted — display:none keeps the poll alive */}
          <div style={{ display: activeView === "dashboard" ? "" : "none" }}>
            <Dashboard refreshKey={dashboardRefreshKey} navigate={navigate} />
          </div>

          {activeView === "reservations" && (
            <Reservations
              auth={auth}
              onLoginRequired={() => navigate("login")}
              onDataChange={triggerDashboardRefresh}
              syncKey={remoteSyncKey}
            />
          )}

          {activeView === "admin" && (
            auth?.role === "admin"
              ? <Admin auth={auth} onAuthError={handleLogout} onDataChange={triggerDashboardRefresh} />
              : <Login onLogin={handleLogin} defaultTab="admin" />
          )}

          {activeView === "login" && (
            <Login onLogin={handleLogin} defaultTab="member" />
          )}

          {activeView === "about" && <AboutUs />}
          {activeView === "membership" && <Membership onSelectPlan={handleSelectPlan} />}
          {activeView === "contact" && <ContactUs />}
          {activeView === "checkout" && (
            <Checkout
              plan={selectedPlan}
              onBack={() => navigate("membership")}
              onDone={() => navigate("membership")}
            />
          )}
        </main>

        <Footer navigate={navigate} />
      </div>
    </>
  );
}
