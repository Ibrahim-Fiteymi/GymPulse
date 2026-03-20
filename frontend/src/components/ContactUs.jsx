import { motion } from "framer-motion";

export default function ContactUs() {
  return (
    <div className="contact-page">

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="contact-hero">
        <div className="contact-hero-glow" />
        <motion.div
          className="contact-hero-content"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <img src="/contact-us.png" alt="Contact Us" className="contact-hero-icon" />
          <h1 className="contact-heading">Get in <em>Touch</em></h1>
          <p className="contact-sub">
            Have a question, a concern, or just want to say hello?
            We're always happy to hear from you.
          </p>
        </motion.div>
      </section>

      {/* ── Contact cards ───────────────────────────────────────── */}
      <section className="contact-cards-section">
        <div className="contact-cards-grid">

          <motion.div
            className="contact-card"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <img src="/contact-mail.png" alt="Email" className="contact-card-icon" />
            <h3>Email Us</h3>
            <p>Drop us a message and we'll get back to you within 24 hours.</p>
            <a className="contact-value" href="mailto:hello@gympulse.io">
              hello@gympulse.io
            </a>
          </motion.div>

          <motion.div
            className="contact-card"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <img src="/contact-us.png" alt="Phone" className="contact-card-icon" />
            <h3>Call Us</h3>
            <p>Speak directly with our team. Available Mon–Fri, 8 AM – 8 PM.</p>
            <a className="contact-value" href="tel:+902121234567">
              +90 (212) 123 45 67
            </a>
          </motion.div>

        </div>
      </section>

      {/* ── Hours & location ────────────────────────────────────── */}
      <section className="contact-info section">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2>Visit Us</h2>
          <div className="contact-detail-grid">
            <div className="contact-detail-item">
              <span className="contact-detail-label">Headquarters</span>
              <span className="contact-detail-val">Bağcılar Caddesi No. 42, Bağcılar, Istanbul</span>
            </div>
            <div className="contact-detail-item">
              <span className="contact-detail-label">Opening Hours</span>
              <span className="contact-detail-val">Mon–Fri · 5 AM – 11 PM</span>
              <span className="contact-detail-val">Sat–Sun · 6 AM – 10 PM</span>
            </div>
          </div>
        </motion.div>
      </section>

    </div>
  );
}
