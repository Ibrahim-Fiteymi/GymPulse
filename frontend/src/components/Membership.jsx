import { motion } from "framer-motion";

const PLANS = [
  {
    id: "visit",
    name: "Day Pass",
    price: "$10",
    period: "per visit",
    desc: "Drop in whenever you want. No commitment, no strings.",
    badge: null,
    features: [
      "Full gym floor access",
      "Locker room & showers",
      "Equipment reservation (1 slot)",
      "Valid for 1 day",
    ],
    cta: "Get a Pass",
    highlight: false,
  },
  {
    id: "monthly",
    name: "Monthly",
    price: "$49",
    period: "per month",
    desc: "Ideal for members building a consistent routine.",
    badge: null,
    features: [
      "Unlimited gym access",
      "Unlimited reservations",
      "Access to all branches",
      "1 guest pass / month",
      "Progress tracking",
    ],
    cta: "Start Monthly",
    highlight: false,
  },
  {
    id: "quarterly",
    name: "Quarterly",
    price: "$129",
    period: "per 3 months",
    desc: "Save more, train longer. The most popular choice.",
    badge: "Most Popular",
    features: [
      "Everything in Monthly",
      "2 guest passes / month",
      "Priority booking",
      "Nutrition consultation",
      "Free locker assignment",
    ],
    cta: "Go Quarterly",
    highlight: true,
  },
  {
    id: "yearly",
    name: "Yearly",
    price: "$399",
    period: "per year",
    desc: "All-in. Maximum savings, maximum results.",
    badge: "Best Value",
    features: [
      "Everything in Quarterly",
      "Unlimited guest passes",
      "Dedicated coach session (monthly)",
      "Towel & gear service",
      "VIP lounge access",
      "Free merchandise kit",
    ],
    cta: "Go Yearly",
    highlight: false,
  },
];

const PERKS = [
  { icon: "/icon.png", title: "8 Locations", body: "Train at any of our branches — your membership travels with you." },
  { icon: "/icon.png", title: "No Hidden Fees", body: "What you see is what you pay. No sign-up fees, no cancellation charges." },
  { icon: "/icon.png", title: "Freeze Anytime", body: "Going on holiday? Pause your membership for up to 60 days per year." },
];

function PlanCard({ plan, delay, onSelectPlan }) {
  return (
    <motion.div
      className={`membership-card ${plan.highlight ? "membership-card--highlight" : ""}`}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
    >
      {plan.badge && <div className="membership-badge">{plan.badge}</div>}

      <div className="membership-card-header">
        <h3 className="membership-plan-name">{plan.name}</h3>
        <div className="membership-price-row">
          <span className="membership-price">{plan.price}</span>
          <span className="membership-period">{plan.period}</span>
        </div>
        <p className="membership-desc">{plan.desc}</p>
      </div>

      <ul className="membership-features">
        {plan.features.map((f) => (
          <li key={f}>
            <span className="membership-check">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <motion.button
        className={`membership-cta ${plan.highlight ? "membership-cta--primary" : "membership-cta--secondary"}`}
        whileTap={{ scale: 0.97 }}
        onClick={() => onSelectPlan(plan)}
      >
        {plan.cta}
      </motion.button>
    </motion.div>
  );
}

export default function Membership({ onSelectPlan }) {
  return (
    <div className="membership-page">

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="membership-hero">
        <div className="membership-hero-glow" />
        <motion.div
          className="membership-hero-content"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="membership-eyebrow">Flexible Plans</span>
          <h1 className="membership-heading">
            Find Your <em>Perfect Plan</em>
          </h1>
          <p className="membership-sub">
            Whether you're dropping in for a session or committing to a full year,
            GymPulse has a plan built around your lifestyle.
          </p>
        </motion.div>
      </section>

      {/* ── Plans grid ──────────────────────────────────────────── */}
      <section className="membership-plans-section">
        <div className="membership-grid">
          {PLANS.map((plan, i) => (
            <PlanCard key={plan.id} plan={plan} delay={0.08 * i} onSelectPlan={onSelectPlan} />
          ))}
        </div>
      </section>

      {/* ── Perks ───────────────────────────────────────────────── */}
      <section className="membership-perks section">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          Every Plan Includes
        </motion.h2>
        <div className="membership-perks-grid">
          {PERKS.map((p, i) => (
            <motion.div
              key={p.title}
              className="membership-perk-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 * i + 0.3, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <img src={p.icon} alt={p.title} className="membership-perk-icon" />
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

    </div>
  );
}
