import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loginAdmin, loginMember } from "../api";

export default function Login({ onLogin, defaultTab = "member" }) {
  const [tab,      setTab]      = useState(defaultTab);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  function switchTab(next) { setTab(next); setError(null); setUsername(""); setPassword(""); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const result = tab === "admin"
        ? await loginAdmin(username.trim(), password)
        : await loginMember(username.trim(), password);
      onLogin(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <motion.div
        className="login-box"
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="login-header">
          <motion.img
            src="/icon.png"
            alt="GymPulse"
            className="brand-icon brand-icon--lg"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.45, ease: [0.22,1,0.36,1] }}
            style={{ filter: "drop-shadow(0 0 12px rgba(239,68,68,0.6))" }}
          />
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4 }}
          >
            Sign in to GymPulse
          </motion.h2>
        </div>

        <div className="login-tabs">
          {["member", "admin"].map(t => (
            <button
              key={t}
              type="button"
              className={`login-tab ${tab === t ? "active" : ""}`}
              onClick={() => switchTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="err"
              className="feedback error"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0,  height: "auto" }}
              exit={{    opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-username">
              {tab === "admin" ? "Username" : "Email"}
            </label>
            <input
              id="login-username"
              type={tab === "admin" ? "text" : "email"}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={tab === "admin" ? "admin" : "your@email.com"}
              required
              autoComplete={tab === "admin" ? "username" : "email"}
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <motion.button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 8, padding: "13px" }}
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </motion.button>
        </form>

      </motion.div>
    </div>
  );
}
