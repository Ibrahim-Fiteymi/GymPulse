/**
 * CinematicIntro.jsx — Premium fullscreen boot sequence.
 *
 * Sequence:
 *  0.0s  — black screen (logo hidden, scale 0.7, opacity 0)
 *  0.3s  — logo + wordmark fade in + scale up to 1
 *  1.0s  — scan line sweeps across
 *  1.6s  — hold
 *  2.0s  — everything scales up + white flash → exit
 *  2.4s  — onDone() fires, app mounts underneath
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function CinematicIntro({ onDone }) {
  const doneRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onDone(); }
    }, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="intro-overlay"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeIn", delay: 2.15 }}
    >
      {/* Ambient red radial glow */}
      <motion.div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 40% 35% at 50% 50%, rgba(239,68,68,0.12) 0%, transparent 70%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      />

      {/* Horizontal scan line sweep */}
      <motion.div
        className="intro-scan-line"
        initial={{ top: "-2px", opacity: 0 }}
        animate={{ top: "102%", opacity: [0, 0.7, 0.7, 0] }}
        transition={{ duration: 0.7, delay: 0.9, ease: "easeIn" }}
      />

      {/* Logo group */}
      <motion.div
        className="intro-logo-wrap"
        initial={{ opacity: 0, scale: 0.72, y: 12 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        transition={{ duration: 0.55, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Icon with red glow pulse */}
        <motion.img
          src="/icon.png"
          alt="GymPulse"
          className="intro-logo-img"
          animate={{ filter: [
            "drop-shadow(0 0 16px rgba(239,68,68,0.6))",
            "drop-shadow(0 0 32px rgba(239,68,68,0.9))",
            "drop-shadow(0 0 16px rgba(239,68,68,0.6))",
          ]}}
          transition={{ duration: 1.2, delay: 0.6, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Wordmark */}
        <motion.div
          className="intro-wordmark"
          initial={{ opacity: 0, letterSpacing: "0.4em" }}
          animate={{ opacity: 1, letterSpacing: "0.12em" }}
          transition={{ duration: 0.55, delay: 0.45, ease: "easeOut" }}
        >
          GYM<span>PULSE</span>
        </motion.div>

        {/* Tagline */}
        <motion.div
          className="intro-tagline"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          Performance Control System
        </motion.div>

        {/* Progress bar */}
        <motion.div
          style={{
            marginTop: 20, width: 120, height: 1,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 2, overflow: "hidden", position: "relative",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <motion.div
            style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              background: "linear-gradient(90deg, #ef4444, #f87171)",
              borderRadius: 2,
            }}
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.1, delay: 0.9, ease: "easeInOut" }}
          />
        </motion.div>
      </motion.div>

      {/* Zoom-out flash on exit */}
      <motion.div
        style={{
          position: "absolute", inset: 0, background: "#fff",
          pointerEvents: "none",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0, 0.6, 0] }}
        transition={{ duration: 0.5, delay: 2.0, times: [0, 0.6, 0.7, 0.85, 1] }}
      />
    </motion.div>
  );
}
