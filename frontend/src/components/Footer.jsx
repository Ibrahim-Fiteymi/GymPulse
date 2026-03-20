import { motion } from "framer-motion";

const PAYMENT_ICONS = [
  { src: "/visa.png",        alt: "Visa" },
  { src: "/mastercard.png",  alt: "MasterCard" },
  { src: "/paypal.png",      alt: "PayPal" },
];

const SOCIAL_ICONS = [
  { src: "/facebook.png",  alt: "Facebook" },
  { src: "/instagram.png", alt: "Instagram" },
  { src: "/twitter.png",   alt: "X" },
  { src: "/tik-tok.png",   alt: "TikTok" },
];

const FOOTER_CARDS = [
  { title: "About Us",   icon: "/icon.png",        desc: "Our story, mission & values.",      iconSize: 42, view: "about" },
  { title: "Membership", icon: "/membership.png",  desc: "Flexible plans for every goal.",    iconSize: 42, view: "membership" },
  { title: "Contact Us", icon: "/contact-us.png",  desc: "We're here whenever you need us.",  iconSize: 32, view: "contact" },
];

export default function Footer({ navigate }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">

        {/* ── Brand ─────────────────────────────────────────────── */}
        <div className="footer-brand-row">
          <img src="/icon.png" alt="GymPulse" className="footer-logo" />
          <div>
            <span className="footer-brand-name">GymPulse</span>
            <p className="footer-tagline">Train harder. Live better.</p>
          </div>
        </div>

        {/* ── Columns + Cards ───────────────────────────────────── */}
        <div className="footer-cols">

          {/* HELP */}
          <div className="footer-col">
            <h4 className="footer-col-title">Help</h4>
            <ul className="footer-links">
              <li>
                <button className="footer-link" onClick={() => navigate("contact")}>
                  Contact Us
                </button>
              </li>
            </ul>
          </div>

          {/* MY ACCOUNT */}
          <div className="footer-col">
            <h4 className="footer-col-title">My Account</h4>
            <ul className="footer-links">
              <li>
                <button className="footer-link" onClick={() => navigate("login")}>
                  Log In
                </button>
              </li>
            </ul>
          </div>

          {/* PAGES */}
          <div className="footer-col">
            <h4 className="footer-col-title">Pages</h4>
            <ul className="footer-links">
              <li>
                <button className="footer-link" onClick={() => navigate("dashboard")}>
                  Dashboard
                </button>
              </li>
              <li>
                <button className="footer-link" onClick={() => navigate("reservations")}>
                  Reservations
                </button>
              </li>
              <li>
                <button className="footer-link" onClick={() => navigate("about")}>
                  About Us
                </button>
              </li>
              <li>
                <button className="footer-link" onClick={() => navigate("membership")}>
                  Membership
                </button>
              </li>
              <li>
                <button className="footer-link" onClick={() => navigate("contact")}>
                  Contact Us
                </button>
              </li>
            </ul>
          </div>

          {/* MORE ABOUT GYM PLUS */}
          <div className="footer-col footer-col-cards">
            <h4 className="footer-col-title">More About Gym Plus</h4>
            <div className="footer-cards">
              {FOOTER_CARDS.map((card) => (
                <motion.button
                  key={card.title}
                  className="footer-card"
                  onClick={() => navigate(card.view)}
                  whileHover={{ y: -5, scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="footer-card-icon-wrap" style={{ width: card.iconSize, height: 42 }}>
                    <img src={card.icon} alt={card.title} className="footer-card-icon" />
                  </div>
                  <span className="footer-card-title">{card.title}</span>
                  <span className="footer-card-desc">{card.desc}</span>
                </motion.button>
              ))}
            </div>
          </div>

        </div>

        {/* ── Bottom bar ────────────────────────────────────────── */}
        <div className="footer-bottom">
          <div className="footer-payments">
            {PAYMENT_ICONS.map((p) => (
              <img key={p.alt} src={p.src} alt={p.alt} className="footer-payment-icon" />
            ))}
          </div>

          <p className="footer-copy">
            © {new Date().getFullYear()} GymPulse. All rights reserved.
          </p>

          <div className="footer-socials">
            {SOCIAL_ICONS.map((s) => (
              <a
                key={s.alt}
                href="#"
                className="footer-social-link"
                aria-label={s.alt}
                onClick={(e) => e.preventDefault()}
              >
                <img src={s.src} alt={s.alt} className="footer-social-icon" />
              </a>
            ))}
          </div>
        </div>

      </div>
    </footer>
  );
}
