import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getEquipment, createEquipment, updateEquipment, deleteEquipment, getReservations } from "../api";

const EMPTY_EQ_FORM = { name:"", category:"", zone:"", status:"available", description:"" };

export default function Admin({ auth, onAuthError, onDataChange }) {
  const [equipment,     setEquipment]     = useState([]);
  const [logs,          setLogs]          = useState([]);
  const [eqForm,        setEqForm]        = useState(EMPTY_EQ_FORM);
  const [editEquipment, setEditEquipment] = useState(null);
  const [feedback,      setFeedback]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [eqSubmitting,  setEqSubmitting]  = useState(false);
  const [eqErrors,      setEqErrors]      = useState({});

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(()=>setFeedback(null), 5000);
    return ()=>clearTimeout(t);
  }, [feedback]);

  async function loadData() {
    try {
      const [eq, completed] = await Promise.all([getEquipment(), getReservations("completed")]);
      setEquipment(eq); setLogs(completed.slice(0,20)); setLoading(false);
    } catch (err) { setFeedback({type:"error",text:err.message}); setLoading(false); }
  }

  function validateEqForm() {
    const e = {};
    if (!eqForm.name.trim())     e.name     = "Name is required.";
    if (!eqForm.category.trim()) e.category = "Category is required.";
    if (!eqForm.zone.trim())     e.zone     = "Zone is required.";
    return e;
  }

  function handleEqChange(e) {
    const {name,value} = e.target;
    setEqForm({...eqForm,[name]:value});
    if (eqErrors[name]) setEqErrors({...eqErrors,[name]:null});
  }

  function handleEditClick(eq) {
    setEditEquipment(eq); setEqErrors({});
    setEqForm({ name:eq.name||"", category:eq.category||"", zone:eq.zone||"", status:eq.status||"available", description:eq.description||"" });
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function handleCancelEdit() { setEditEquipment(null); setEqErrors({}); setEqForm(EMPTY_EQ_FORM); }

  async function handleEqSubmit(e) {
    e.preventDefault(); setFeedback(null);
    const errors = validateEqForm();
    if (Object.keys(errors).length) { setEqErrors(errors); return; }
    setEqErrors({}); setEqSubmitting(true);
    try {
      if (editEquipment) {
        await updateEquipment(editEquipment.id, eqForm);
        setFeedback({type:"success",text:"Equipment updated!"}); setEditEquipment(null);
      } else {
        await createEquipment(eqForm);
        setFeedback({type:"success",text:"Equipment added!"});
      }
      setEqForm(EMPTY_EQ_FORM); await loadData(); onDataChange?.();
    } catch (err) {
      const msg = err.message==="Failed to fetch"
        ? "Cannot reach the server. Make sure the backend is running on port 8000."
        : err.message;
      setFeedback({type:"error",text:msg});
      if (err.message.includes("log in")||err.message.includes("authenticated")) onAuthError?.();
    } finally { setEqSubmitting(false); }
  }

  async function handleDeleteClick(id, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteEquipment(id);
      setFeedback({type:"success",text:`"${name}" deleted.`});
      if (editEquipment?.id===id) handleCancelEdit();
      await loadData(); onDataChange?.();
    } catch (err) {
      const msg = err.message==="Failed to fetch"
        ? "Cannot reach the server. Make sure the backend is running on port 8000."
        : err.message;
      setFeedback({type:"error",text:msg});
      if (err.message.includes("log in")||err.message.includes("authenticated")) onAuthError?.();
    }
  }

  if (loading) return <div className="loading">Loading admin panel…</div>;

  const sectionStyle = {
    background:"var(--bg-glass)", backdropFilter:"blur(20px)",
    border:"1px solid var(--border)", borderRadius:"var(--radius-lg)",
    padding:28, boxShadow:"var(--shadow-card)",
  };

  return (
    <div className="admin-view">
      <AnimatePresence>
        {feedback && (
          <motion.div key="fb" className={`feedback ${feedback.type}`}
            initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.25}}>
            {feedback.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add / Edit Equipment ────────────────────────────────── */}
      <motion.section
        className="section" style={sectionStyle}
        initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5}}
      >
        <h2>{editEquipment ? `Edit Equipment: ${editEquipment.name}` : "Add Equipment"}</h2>
        <form className="res-form" onSubmit={handleEqSubmit} noValidate style={{marginTop:18}}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="eq-name">Name <span className="required-mark">*</span></label>
              <input id="eq-name" name="name" type="text" placeholder="e.g. Treadmill #4"
                value={eqForm.name} onChange={handleEqChange}
                className={eqErrors.name?"input-error":""} maxLength={100} />
              {eqErrors.name && <span className="field-error">{eqErrors.name}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="eq-category">Category <span className="required-mark">*</span></label>
              <input id="eq-category" name="category" type="text" placeholder="e.g. Cardio"
                value={eqForm.category} onChange={handleEqChange}
                className={eqErrors.category?"input-error":""} />
              {eqErrors.category && <span className="field-error">{eqErrors.category}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="eq-zone">Zone <span className="required-mark">*</span></label>
              <input id="eq-zone" name="zone" type="text" placeholder="e.g. Cardio Floor"
                value={eqForm.zone} onChange={handleEqChange}
                className={eqErrors.zone?"input-error":""} />
              {eqErrors.zone && <span className="field-error">{eqErrors.zone}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="eq-status">Status</label>
              <select id="eq-status" name="status" value={eqForm.status} onChange={handleEqChange}>
                <option value="available">Available</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="eq-desc">Description</label>
            <textarea id="eq-desc" name="description" value={eqForm.description}
              onChange={handleEqChange} placeholder="Optional description" maxLength={500} rows={2} />
          </div>

          <div style={{display:"flex",gap:10}}>
            <motion.button type="submit" className="btn btn-primary" disabled={eqSubmitting}
              whileHover={{scale:1.02}} whileTap={{scale:0.98}}>
              {eqSubmitting ? (editEquipment?"Updating…":"Adding…") : (editEquipment?"Update Equipment":"Add Equipment")}
            </motion.button>
            {editEquipment && (
              <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>Cancel</button>
            )}
          </div>
        </form>
      </motion.section>

      {/* ── Equipment Inventory ─────────────────────────────────── */}
      <motion.section
        className="section" style={sectionStyle}
        initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5,delay:0.08}}
      >
        <h2>Equipment Inventory ({equipment.length})</h2>
        <div className="table-wrapper" style={{marginTop:18}}>
          <table>
            <thead>
              <tr><th>ID</th><th>Name</th><th>Category</th><th>Zone</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {equipment.map(eq=>(
                <tr key={eq.id}>
                  <td style={{color:"var(--text-muted)"}}>{eq.id}</td>
                  <td style={{color:"var(--text-primary)",fontWeight:600}}>{eq.name}</td>
                  <td>{eq.category}</td>
                  <td>{eq.zone||"—"}</td>
                  <td><span className={`badge status-${eq.status.replace("_","-")}`}>{eq.status.replace("_"," ")}</span></td>
                  <td style={{whiteSpace:"nowrap"}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>handleEditClick(eq)} style={{marginRight:6}}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>handleDeleteClick(eq.id,eq.name)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* ── Recent Usage Logs ───────────────────────────────────── */}
      <motion.section
        className="section" style={sectionStyle}
        initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5,delay:0.16}}
      >
        <h2>Recent Completed Reservations</h2>
        {logs.length===0 ? (
          <p className="muted" style={{marginTop:12,padding:"24px 0"}}>No completed reservations yet.</p>
        ) : (
          <div className="table-wrapper" style={{marginTop:18}}>
            <table>
              <thead>
                <tr><th>ID</th><th>Equipment</th><th>Member</th><th>Start</th><th>End</th><th>Duration</th></tr>
              </thead>
              <tbody>
                {logs.map(log=>{
                  const eqName = equipment.find(e=>e.id===log.equipment_id)?.name||`#${log.equipment_id}`;
                  const dur = Math.round((new Date(log.end_time)-new Date(log.start_time))/60000);
                  return (
                    <tr key={log.id}>
                      <td style={{color:"var(--text-muted)"}}>{log.id}</td>
                      <td style={{color:"var(--text-primary)",fontWeight:600}}>{eqName}</td>
                      <td>{log.member_name||"—"}</td>
                      <td>{new Date(log.start_time).toLocaleString()}</td>
                      <td>{new Date(log.end_time).toLocaleString()}</td>
                      <td><span className="eq-glass-chip">{dur} min</span></td>
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
