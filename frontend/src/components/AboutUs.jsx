import { motion } from "framer-motion";

const STATS = [
  { value: "2015",   label: "Founded" },
  { value: "2,400+", label: "Active Members" },
  { value: "8",      label: "Branches" },
  { value: "97%",    label: "Satisfaction Rate" },
];

function Stat({ value, label, delay }) {
  return (
    <motion.div
      className="about-stat-card"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="about-stat-val">{value}</span>
      <span className="about-stat-lbl">{label}</span>
    </motion.div>
  );
}

export default function AboutUs() {
  return (
    <div className="about-page">

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="about-hero">
        <div className="about-hero-glow" />
        <motion.div
          className="about-hero-content"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <img src="/icon.png" alt="GymPulse" className="about-logo" />
          <h1 className="about-heading">
            About <em>GymPulse</em>
          </h1>
          <p className="about-sub">
            A decade of passion for fitness, community, and relentless improvement.
          </p>
        </motion.div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────── */}
      <section className="about-stats-section">
        <div className="about-stats-grid">
          {STATS.map((s, i) => (
            <Stat key={s.label} value={s.value} label={s.label} delay={0.1 * i} />
          ))}
        </div>
      </section>

      {/* ── Story ───────────────────────────────────────────────── */}
      <section className="about-story section">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2>Our Story</h2>
          <p>
            GymPulse was founded in 2015 by a small group of fitness enthusiasts who believed
            that access to world-class training facilities should be simple, seamless, and
            community-driven. What started as a single 1,200 m² space in the city center has
            grown into a network of eight premium branches spanning the region, serving over
            2,400 active members every month.
          </p>
          <p>
            From day one, our philosophy has been straightforward: remove every barrier between
            a person and their best self. We invested in top-tier equipment, hired certified
            coaches who genuinely care, and built the technology — including this platform — to
            give members real-time visibility into availability and effortless booking.
          </p>

          <h2>Our Mission</h2>
          <p>
            To make elite fitness accessible, measurable, and enjoyable for every member —
            whether they're a first-time gym-goer or a seasoned athlete preparing for
            competition. We believe data-driven training leads to better results, and our
            reservation and analytics systems are built around that conviction. Every feature
            you see in GymPulse exists because a real member asked for it.
          </p>

          <h2>Our Values</h2>
          <div className="about-values-grid">
            {[
              { title: "Community First",   body: "We build relationships, not just memberships. Every branch is a space where people support each other." },
              { title: "No Excuses",        body: "Open 365 days a year. Early mornings, late nights — we're here when you decide to show up." },
              { title: "Data-Driven",       body: "From peak-hour analytics to personal usage logs, we help you train smarter, not just harder." },
              { title: "Premium Quality",   body: "We replace equipment on a strict maintenance cycle and partner only with the top brands in fitness." },
            ].map((v) => (
              <div key={v.title} className="about-value-card">
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </div>
            ))}
          </div>

          {/* ── Contact ─────────────────────────────────────────── */}
          <h2>Contact Us</h2>
          <div className="about-contact-grid">
            <div className="about-contact-item">
              <span className="about-contact-label">Email</span>
              <span className="about-contact-val">hello@gympulse.io</span>
            </div>
            <div className="about-contact-item">
              <span className="about-contact-label">Phone</span>
              <span className="about-contact-val">+90 (212) 123 45 67</span>
            </div>
            <div className="about-contact-item">
              <span className="about-contact-label">Headquarters</span>
              <span className="about-contact-val">Bağcılar Caddesi No. 42, Bağcılar, Istanbul</span>
            </div>
            <div className="about-contact-item">
              <span className="about-contact-label">Hours</span>
              <span className="about-contact-val">Mon–Fri 5 AM – 11 PM · Sat–Sun 6 AM – 10 PM</span>
            </div>
          </div>
        </motion.div>
      </section>

    </div>
  );
}
