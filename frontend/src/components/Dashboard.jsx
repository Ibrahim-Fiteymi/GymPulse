import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import Card3D from "./Card3D";
import {
  getAnalyticsSummary,
  getEquipment,
  getMostUsed,
  getReservations,
} from "../api";

const POLL_INTERVAL = 15000;

const EQUIPMENT_IMAGES = {
  "Bench Press":    "/bench-press.png",
  "Treadmill":  "/treadmill.png",
  "Elliptical": "/treadmill-2.png",
  "Squat Rack":     "/squat-rack.png",
  "Rowing Machine": "/rowing-machine.png",
};

const EQUIPMENT_POSITIONS = {
  "Treadmill":  "68% 60%",
  "Elliptical": "72% 60%",
  "Rowing Machine": "70% center",
};

function equipmentImage(name)    { return EQUIPMENT_IMAGES[name]    || null; }
function equipmentPosition(name) { return EQUIPMENT_POSITIONS[name] || "center center"; }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDateLabel(str) {
  if (!str) return "";
  const [y,m,d] = str.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:"short",year:"numeric",month:"short",day:"numeric"});
}

function formatHour(h) {
  if (h===0) return "12 AM";
  if (h<12)  return `${h} AM`;
  if (h===12) return "12 PM";
  return `${h-12} PM`;
}

function localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function statusClass(s) {
  return { available:"status-available", in_use:"status-in-use", reserved:"status-reserved", maintenance:"status-maintenance" }[s] || "";
}

/* Animated counter — counts up from 0 to target on mount / change */
function AnimatedNumber({ value, duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const end   = value;
    prev.current = end;
    if (start === end) return;
    const startTime = performance.now();
    function tick(now) {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{display}</>;
}

/* Section fade-up reveal */
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

const KPI_ICONS = {
  "Total Equipment": "⬡",
  "Available Now":   "◎",
  "In Use":          "▶",
  "Reservations":    "⊞",
  "Maintenance":     "⚠",
};

export default function Dashboard({ refreshKey = 0, navigate }) {
  const [summary,        setSummary]        = useState(null);
  const [equipment,      setEquipment]      = useState([]);
  const [mostUsed,       setMostUsed]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [retryCount,     setRetryCount]     = useState(0);

  // Upcoming reservations state
  const [upcomingRes,    setUpcomingRes]    = useState([]);
  const [upcomingLoading,setUpcomingLoading]= useState(false);
  const [selectedDate,   setSelectedDate]   = useState(todayStr);
  const [selectedHour,   setSelectedHour]   = useState("");

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const [s, e, m] = await Promise.all([
          getAnalyticsSummary(), getEquipment(), getMostUsed(3),
        ]);
        if (!cancelled) {
          setSummary(s); setEquipment(e); setMostUsed(m);
          setLoading(false); setError(null);
        }
      } catch (err) {
        if (!cancelled) { setError(err.message); setLoading(false); }
      }
    }
    if (summary === null) setLoading(true);
    fetchAll();
    const iv = setInterval(fetchAll, POLL_INTERVAL);
    return () => { cancelled = true; clearInterval(iv); };
  }, [retryCount, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch upcoming (confirmed) reservations separately
  useEffect(() => {
    let cancelled = false;
    setUpcomingLoading(true);
    getReservations("confirmed")
      .then(data => { if (!cancelled) { setUpcomingRes(data); setUpcomingLoading(false); } })
      .catch(()   => { if (!cancelled) setUpcomingLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey, retryCount]);

  if (loading) return <div className="loading">Initializing systems…</div>;

  if (error) return (
    <div className="error-box">
      <p>⚠ {error}</p>
      <button className="btn btn-primary" style={{ marginTop: 20 }}
        onClick={() => { setError(null); setLoading(true); setRetryCount(c=>c+1); }}>
        Retry
      </button>
    </div>
  );

  // Build equipment name lookup: id → name
  const eqNameMap = Object.fromEntries(equipment.map(e => [e.id, e.name]));

  const now = new Date();

  // Filter upcoming: future only, matching selected date and optionally hour
  const filteredUpcoming = upcomingRes
    .filter(r => {
      const start = new Date(r.start_time);
      if (start <= now) return false;
      if (selectedDate && localDateStr(start) !== selectedDate) return false;
      if (selectedHour !== "" && start.getHours() !== parseInt(selectedHour, 10)) return false;
      return true;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const kpis = [
    { label: "Total Equipment", value: summary.total_equipment,    cls: "" },
    { label: "Available Now",   value: summary.available_now,      cls: "kpi-available" },
    { label: "In Use",          value: summary.in_use_now,         cls: "kpi-in-use" },
    { label: "Reservations",    value: summary.active_reservations, cls: "" },
    { label: "Maintenance",     value: summary.under_maintenance,  cls: "kpi-maintenance" },
  ];

  return (
    <div className="dashboard">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <Reveal>
        <section className="hero-section">
          <video className="hero-video" autoPlay loop muted playsInline src="/background-video.mp4" />
          <div className="hero-overlay" />
          <div className="hero-content">
            <motion.div
              className="hero-eyebrow"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <span>●</span> Live System
            </motion.div>
            <motion.h1
              className="hero-heading"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6, ease: [0.22,1,0.36,1] }}
            >
              Train Harder.<br /><em>Live Better.</em>
            </motion.h1>
            <motion.p
              className="hero-sub"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              Real-time equipment availability, seamless booking, and live gym
              analytics — all in one control room.
            </motion.p>
            <motion.div
              className="hero-actions"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.5 }}
            >
              <button className="btn-hero-primary" onClick={()=>{ navigate?.("reservations"); }}>
                Book Equipment
              </button>
              <button className="btn-hero-secondary" onClick={()=>{ window.scrollBy({top:600,behavior:"smooth"}); }}>
                Explore Stats
              </button>
            </motion.div>
          </div>
        </section>
      </Reveal>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <Reveal delay={0.05}>
        <section className="kpi-section">
          <h2>Overview</h2>
          <div className="kpi-grid" style={{ marginTop: 18 }}>
            {kpis.map((k, i) => (
              <motion.div
                key={k.label}
                className={`kpi-card ${k.cls}`}
                initial={{ opacity: 0, y: 20, scale: 0.94 }}
                animate={{ opacity: 1, y: 0,  scale: 1 }}
                transition={{ delay: 0.08 * i, duration: 0.45, ease: [0.22,1,0.36,1] }}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
              >
                <span className="kpi-icon">{KPI_ICONS[k.label]}</span>
                <span className="kpi-value">
                  <AnimatedNumber value={k.value} />
                </span>
                <span className="kpi-label">{k.label}</span>
              </motion.div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── Equipment Availability ────────────────────────────────── */}
      <Reveal delay={0.05}>
        <section className="section">
          <h2>Equipment Availability</h2>
          <div className="equipment-grid" style={{ marginTop: 18 }}>
            {equipment.map((eq) => {
              const img = equipmentImage(eq.name);
              return (
                <Card3D key={eq.id}>
                  <div
                    className={`equipment-card ${statusClass(eq.status)}`}
                    style={img ? { backgroundImage: `url(${img})`, backgroundPosition: equipmentPosition(eq.name) } : {}}
                  >
                    {img && <div className="eq-img-overlay" />}
                    <div className="eq-card-content">
                      <h3>{eq.name}</h3>
                      <p className="eq-meta">{eq.category}{eq.zone ? ` · ${eq.zone}` : ""}</p>
                      <div className="eq-card-actions">
                        <span className={`badge ${statusClass(eq.status)}`}>
                          {eq.status.replace("_"," ")}
                        </span>
                        <span className="eq-glass-chip">{eq.zone || eq.category}</span>
                      </div>
                    </div>
                  </div>
                </Card3D>
              );
            })}
          </div>
        </section>
      </Reveal>

      {/* ── Most Used Equipment ───────────────────────────────────── */}
      <Reveal delay={0.05}>
        <section className="section">
          <h2>
            Most Used Equipment{" "}
            <span className="muted" style={{ fontSize:"0.78rem", fontWeight:400 }}>(Top 3)</span>
          </h2>
          <div className="table-wrapper" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Equipment</th>
                  <th>Sessions</th>
                  <th>Total Minutes</th>
                </tr>
              </thead>
              <tbody>
                {mostUsed.length === 0 ? (
                  <tr><td colSpan={4} style={{textAlign:"center",color:"var(--text-muted)",padding:"24px"}}>No usage data yet.</td></tr>
                ) : mostUsed.map((item, i) => (
                  <motion.tr
                    key={item.equipment_id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.07 * i, duration: 0.35 }}
                  >
                    <td style={{ color: i===0?"var(--accent-light)":"var(--text-muted)", fontWeight:700 }}>
                      {i===0?"▲":i+1}
                    </td>
                    <td style={{ color:"var(--text-primary)", fontWeight:600 }}>{item.equipment_name}</td>
                    <td>{item.total_sessions}</td>
                    <td>{item.total_usage_minutes}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      {/* ── Upcoming Reservations ─────────────────────────────────── */}
      <Reveal delay={0.05}>
        <section className="section">
          <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap", marginBottom:6 }}>
            <h2 style={{ margin:0 }}>Upcoming Reservations</h2>
            <input
              type="date"
              className="date-input"
              value={selectedDate}
              min={todayStr()}
              onChange={e => { setSelectedDate(e.target.value); if (!e.target.value) setSelectedHour(""); }}
            />
            <select
              value={selectedHour}
              onChange={e => setSelectedHour(e.target.value)}
              style={{
                padding:"6px 12px",
                background:"var(--bg-glass)",
                border:"1px solid var(--border)",
                borderRadius:"var(--radius)",
                color:"var(--text-primary)",
                cursor:"pointer",
                fontSize:"0.9rem",
              }}
            >
              <option value="">All Hours</option>
              {Array.from({length:24}, (_,h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </div>
          <p className="muted" style={{ marginBottom:18 }}>
            {selectedDate
              ? <>Reservations on{" "}<strong style={{color:"var(--text-secondary)"}}>{formatDateLabel(selectedDate)}</strong>{selectedHour !== "" ? `, at ${formatHour(parseInt(selectedHour, 10))}` : ""}.</>
              : <>All upcoming reservations{selectedHour !== "" ? ` at ${formatHour(parseInt(selectedHour, 10))}` : ""}.</>
            }{" "}Showing only future bookings.
          </p>
          {upcomingLoading ? (
            <p className="muted">Loading…</p>
          ) : filteredUpcoming.length === 0 ? (
            <p className="muted" style={{padding:"24px 0"}}>No upcoming reservations for this selection.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Equipment</th>
                    <th>Start</th>
                    <th>End</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUpcoming.map((r, i) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity:0, x:-12 }}
                      animate={{ opacity:1, x:0 }}
                      transition={{ delay: 0.05*i, duration: 0.32 }}
                    >
                      <td style={{ color:"var(--text-primary)", fontWeight:600 }}>
                        {r.member_name || "—"}
                      </td>
                      <td>{eqNameMap[r.equipment_id] || `#${r.equipment_id}`}</td>
                      <td>{new Date(r.start_time).toLocaleString()}</td>
                      <td>{new Date(r.end_time).toLocaleString()}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Reveal>

    </div>
  );
}
