import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { getReservations, getEquipment, createReservation, cancelReservation } from "../api";

const EMPTY_FORM = { equipment_id:"", start_time:null, end_time:null, notes:"" };

const STATUS_OPTIONS = [
  { value:"",          label:"All" },
  { value:"confirmed", label:"Confirmed" },
  { value:"cancelled", label:"Cancelled" },
  { value:"completed", label:"Completed" },
];

export default function Reservations({ auth, onLoginRequired, onDataChange, syncKey=0 }) {
  const [reservations, setReservations] = useState([]);
  const [equipment,    setEquipment]    = useState([]);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [feedback,     setFeedback]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [statusFilter, setStatusFilter] = useState("confirmed");
  const [fieldErrors,  setFieldErrors]  = useState({});

  useEffect(() => { setLoading(true); loadData(); }, [statusFilter]); // eslint-disable-line
  useEffect(() => { if (syncKey>0) loadData(); }, [syncKey]);         // eslint-disable-line
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(()=>setFeedback(null), 5000);
    return ()=>clearTimeout(t);
  }, [feedback]);

  async function loadData() {
    try {
      const [res, eq] = await Promise.all([getReservations(statusFilter||undefined), getEquipment()]);
      setReservations(res); setEquipment(eq); setLoading(false);
    } catch (err) { setFeedback({type:"error",text:err.message}); setLoading(false); }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm({...form, [name]:value});
    if (fieldErrors[name]) setFieldErrors({...fieldErrors,[name]:null});
  }

  function validateForm() {
    const errors = {};
    const now = new Date();
    if (!form.equipment_id)              errors.equipment_id = "Please select a piece of equipment.";
    if (!form.start_time)                errors.start_time = "Start time is required.";
    else if (form.start_time <= now)     errors.start_time = "Start time must be in the future.";
    if (!form.end_time)                  errors.end_time = "End time is required.";
    else if (form.start_time && form.end_time <= form.start_time)
                                         errors.end_time = "End time must be after start time.";
    else if (form.start_time && (form.end_time - form.start_time)/60000 > 60)
                                         errors.end_time = "Reservation cannot exceed 60 minutes.";
    if (form.equipment_id && form.start_time && form.end_time && form.end_time > form.start_time
        && !errors.start_time && !errors.end_time) {
      // Check if this equipment is already booked in the selected time range (any member)
      const eqOverlap = reservations
        .filter(r => r.status === "confirmed" && r.equipment_id === parseInt(form.equipment_id, 10))
        .find(r => { const s=new Date(r.start_time),e=new Date(r.end_time); return form.start_time<e&&form.end_time>s; });
      if (eqOverlap) errors.equipment_id = "This equipment is already booked for the selected time range.";
    }
    if (auth && form.start_time && form.end_time && form.end_time > form.start_time
        && !errors.start_time && !errors.end_time) {
      // Check if this member already has a reservation overlapping this time slot
      const myOverlap = reservations
        .filter(r => r.status === "confirmed" && r.member_id === auth.member_id)
        .find(r => { const s=new Date(r.start_time),e=new Date(r.end_time); return form.start_time<e&&form.end_time>s; });
      if (myOverlap) errors.start_time = "You already have a reservation that overlaps this time slot.";
    }
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault(); setFeedback(null);
    const errors = validateForm();
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setFieldErrors({}); setSubmitting(true);
    try {
      await createReservation({
        equipment_id: parseInt(form.equipment_id,10),
        start_time:   form.start_time.toISOString(),
        end_time:     form.end_time.toISOString(),
        notes:        form.notes||null,
      });
      setFeedback({type:"success",text:"Reservation created successfully!"});
      setForm(EMPTY_FORM); await loadData(); onDataChange?.();
    } catch (err) {
      setFeedback({type:"error",text:err.message});
      if (err.message.includes("authenticated")||err.message.includes("log in")) onLoginRequired?.();
    } finally { setSubmitting(false); }
  }

  async function handleCancel(id) {
    if (!window.confirm("Cancel this reservation?")) return;
    try {
      await cancelReservation(id);
      setFeedback({type:"success",text:"Reservation cancelled."}); await loadData(); onDataChange?.();
    } catch (err) { setFeedback({type:"error",text:err.message}); }
  }

  function canCancel(r) {
    if (r.status!=="confirmed") return false;
    if (!auth) return false;
    if (new Date(r.start_time)<=new Date()) return false;
    if (auth.role==="admin") return true;
    return r.member_id === auth.member_id;
  }

  if (loading) return <div className="loading">Loading reservations…</div>;

  const now = new Date();
  // Members only see their own reservations.
  // For "confirmed" filter: show only future ones (can't cancel past ones anyway).
  // For "completed"/"cancelled"/all: show full history so they can review past bookings.
  const displayedReservations = auth?.role === "member"
    ? reservations.filter(r => {
        if (r.member_id !== auth.member_id) return false;
        if (new Date(r.start_time) <= now) return false; // never show past reservations to members
        return true;
      })
    : reservations;

  return (
    <div className="reservations-view">
      <AnimatePresence>
        {feedback && (
          <motion.div
            key="fb"
            className={`feedback ${feedback.type}`}
            initial={{opacity:0,y:-10}}
            animate={{opacity:1,y:0}}
            exit={{opacity:0,y:-10}}
            transition={{duration:0.25}}
          >
            {feedback.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create Reservation ──────────────────────────────────── */}
      <motion.section
        className="section"
        initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5}}
        style={{ background:"var(--bg-glass)", backdropFilter:"blur(20px)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:28, marginBottom:32, boxShadow:"var(--shadow-card)" }}
      >
        <h2>Create Reservation</h2>

        {!auth ? (
          <div className="login-prompt" style={{marginTop:16}}>
            <p>You must be logged in to make a reservation.</p>
            <button className="btn btn-primary" style={{marginTop:12}} onClick={onLoginRequired}>
              Sign In
            </button>
          </div>
        ) : (
          <form className="res-form" onSubmit={handleSubmit} noValidate style={{marginTop:16}}>
            <div className="reserving-as">
              Reserving as <strong>{auth.name}</strong>
              <span className="user-role-badge" style={{marginLeft:6}}>{auth.role}</span>
            </div>

            <div className="form-group">
              <label htmlFor="equipment_id">Equipment <span className="required-mark">*</span></label>
              <select
                id="equipment_id" name="equipment_id"
                value={form.equipment_id} onChange={handleChange}
                className={fieldErrors.equipment_id?"input-error":""}
              >
                <option value="">Select equipment…</option>
                {equipment.map(eq=>(
                  <option key={eq.id} value={eq.id} disabled={eq.status==="maintenance"}>
                    {eq.name}{eq.zone?` (${eq.zone})`:""}{eq.status==="maintenance"?" — Under Maintenance":""}
                  </option>
                ))}
              </select>
              {fieldErrors.equipment_id && <span className="field-error">{fieldErrors.equipment_id}</span>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Start Time <span className="required-mark">*</span></label>
                <DatePicker
                  selected={form.start_time}
                  onChange={date=>{ setForm({...form,start_time:date,end_time:null}); setFieldErrors({...fieldErrors,start_time:null,end_time:null}); }}
                  showTimeSelect timeIntervals={5} dateFormat="MMM d, yyyy h:mm aa"
                  placeholderText="Pick start date & time" minDate={new Date()}
                  minTime={
                    !form.start_time || form.start_time.toDateString() === new Date().toDateString()
                      ? new Date()
                      : new Date(new Date().setHours(0, 0, 0, 0))
                  }
                  maxTime={new Date(new Date().setHours(23, 59, 0, 0))}
                  showYearDropdown showMonthDropdown dropdownMode="select"
                  onChangeRaw={e=>e.preventDefault()}
                  className={fieldErrors.start_time?"datepicker-input input-error":"datepicker-input"}
                  wrapperClassName="datepicker-wrapper" popperPlacement="bottom-start" portalId="datepicker-portal"
                />
                {fieldErrors.start_time && <span className="field-error">{fieldErrors.start_time}</span>}
              </div>
              <div className="form-group">
                <label>End Time <span className="required-mark">*</span></label>
                <DatePicker
                  selected={form.end_time}
                  onChange={date=>{ setForm({...form,end_time:date}); if(fieldErrors.end_time) setFieldErrors({...fieldErrors,end_time:null}); }}
                  showTimeSelect timeIntervals={5} dateFormat="MMM d, yyyy h:mm aa"
                  placeholderText="Pick end date & time" minDate={form.start_time||new Date()}
                  showYearDropdown showMonthDropdown dropdownMode="select"
                  onChangeRaw={e=>e.preventDefault()}
                  className={fieldErrors.end_time?"datepicker-input input-error":"datepicker-input"}
                  wrapperClassName="datepicker-wrapper" popperPlacement="bottom-start" portalId="datepicker-portal"
                />
                {fieldErrors.end_time && <span className="field-error">{fieldErrors.end_time}</span>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes (optional)</label>
              <textarea id="notes" name="notes" value={form.notes} onChange={handleChange}
                placeholder="e.g. Morning session" maxLength={500} rows={2} />
            </div>

            <motion.button type="submit" className="btn btn-primary" disabled={submitting}
              whileHover={{scale:1.02}} whileTap={{scale:0.98}} style={{alignSelf:"flex-start",padding:"12px 28px"}}>
              {submitting ? "Creating…" : "Create Reservation"}
            </motion.button>
          </form>
        )}
      </motion.section>

      {/* ── Reservations List ───────────────────────────────────── */}
      <motion.section
        className="section"
        initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5,delay:0.1}}
      >
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,flexWrap:"wrap"}}>
          <h2 style={{margin:0}}>{auth?.role === "member" ? "Your Reservations" : "Reservations"}</h2>
          <div className="form-group" style={{margin:0,minWidth:160}}>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter by status">
              {STATUS_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {displayedReservations.length===0 ? (
          <p className="muted" style={{padding:"32px 0"}}>No reservations found for this filter.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Equipment</th><th>Member</th>
                  <th>Start</th><th>End</th><th>Status</th><th>Notes</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedReservations.map(r=>{
                  const eqName = equipment.find(e=>e.id===r.equipment_id)?.name||`#${r.equipment_id}`;
                  return (
                    <tr key={r.id}>
                      <td style={{color:"var(--text-muted)"}}>{r.id}</td>
                      <td style={{color:"var(--text-primary)",fontWeight:600}}>{eqName}</td>
                      <td>{r.member_name||"—"}</td>
                      <td>{new Date(r.start_time).toLocaleString()}</td>
                      <td>{new Date(r.end_time).toLocaleString()}</td>
                      <td><span className={`badge status-${(r.status||"").replace("_","-")}`}>{r.status}</span></td>
                      <td style={{color:"var(--text-muted)"}}>{r.notes||"—"}</td>
                      <td>
                        {canCancel(r)&&(
                          <button className="btn btn-danger btn-sm" onClick={()=>handleCancel(r.id)}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}
