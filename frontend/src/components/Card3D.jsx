/**
 * Card3D.jsx — Reusable mouse-tracked 3D tilt card.
 *
 * Tilt direction is derived from the REAL mouse position inside the card:
 *   - Mouse left  → card tilts left  (rotateY negative)
 *   - Mouse right → card tilts right (rotateY positive)
 *   - Mouse top   → card tilts upward   (rotateX positive)
 *   - Mouse bottom→ card tilts downward (rotateX negative)
 *
 * Uses framer-motion useMotionValue + useSpring for butter-smooth, physics-
 * based interpolation. Resets to flat (0,0) on mouse leave.
 */

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";

const SPRING = { stiffness: 280, damping: 28, mass: 0.6 };
const MAX_TILT = 14; // degrees

export default function Card3D({ children, className = "", style = {}, maxTilt = MAX_TILT }) {
  const ref = useRef(null);

  // Raw normalised mouse position: -0.5 → +0.5
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  // Spring-smoothed versions
  const springX = useSpring(rawX, SPRING);
  const springY = useSpring(rawY, SPRING);

  // rotateY: mouse moves RIGHT (+x) → card tilts RIGHT (+rotateY)
  const rotateY = useTransform(springX, [-0.5, 0.5], [-maxTilt, maxTilt]);
  // rotateX: mouse moves DOWN (+y) → card tilts DOWN (-rotateX)
  const rotateX = useTransform(springY, [-0.5, 0.5], [maxTilt, -maxTilt]);

  // Subtle light sheen that tracks mouse
  const sheenX = useTransform(springX, [-0.5, 0.5], ["0%", "100%"]);
  const sheenY = useTransform(springY, [-0.5, 0.5], ["0%", "100%"]);

  function handleMouseMove(e) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    rawX.set((e.clientX - rect.left) / rect.width  - 0.5);
    rawY.set((e.clientY - rect.top)  / rect.height - 0.5);
  }

  function handleMouseLeave() {
    rawX.set(0);
    rawY.set(0);
  }

  return (
    <div
      className="card3d-perspective"
      style={{ perspective: "900px", display: "contents" }}
    >
      <motion.div
        ref={ref}
        className={className}
        style={{
          ...style,
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          willChange: "transform",
          position: "relative",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileHover={{ scale: 1.025 }}
        transition={{ scale: { duration: 0.25, ease: "easeOut" } }}
      >
        {/* Sheen overlay that follows the mouse */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: "radial-gradient(circle at var(--sx) var(--sy), rgba(255,255,255,0.06) 0%, transparent 55%)",
            "--sx": sheenX,
            "--sy": sheenY,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
        {children}
      </motion.div>
    </div>
  );
}
