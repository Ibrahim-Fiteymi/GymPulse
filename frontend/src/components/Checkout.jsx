import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Sandbox test cards ─────────────────────────────────────────────── */
const TEST_CARDS = {
  "4111111111111111": "Visa",
  "5555555555554444": "MasterCard",
};

function genTxnId() {
  return "TXN-" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function saveTransaction(txn) {
  const prev = JSON.parse(localStorage.getItem("gympulse_transactions") || "[]");
  localStorage.setItem("gympulse_transactions", JSON.stringify([txn, ...prev]));
}

function formatCard(val) {
  return val.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ").trimEnd();
}

function formatExpiry(val) {
  const d = val.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
}

/* ── Processing overlay ─────────────────────────────────────────────── */
function Processing() {
  return (
    <motion.div
      className="ck-processing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ck-spinner" />
      <p className="ck-processing-title">Processing your payment…</p>
      <p className="ck-processing-sub">Please do not close this page.</p>
    </motion.div>
  );
}

/* ── Result screen ──────────────────────────────────────────────────── */
function Result({ txn, onRetry, onDone }) {
  const ok = txn.status === "success";
  return (
    <motion.div
      className="ck-result"
      initial={{ opacity: 0, scale: 0.93 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={`ck-result-icon ${ok ? "ck-result-icon--ok" : "ck-result-icon--fail"}`}>
        {ok ? "✓" : "✕"}
      </div>

      <h2 className="ck-result-title">
        {ok ? "Payment Successful!" : "Payment Failed"}
      </h2>
      <p className="ck-result-sub">
        {ok
          ? <>Your <strong>{txn.plan}</strong> plan is now active. Enjoy training!</>
          : "Your card was declined. Check your card details or use a test card."}
      </p>

      <div className="ck-result-card">
        <div className="ck-result-row"><span>Transaction ID</span><span>{txn.id}</span></div>
        <div className="ck-result-row"><span>Method</span><span>{txn.method}</span></div>
        <div className="ck-result-row"><span>Plan</span><span>{txn.plan}</span></div>
        <div className="ck-result-row"><span>Amount</span><span>{txn.amount}</span></div>
        <div className="ck-result-row">
          <span>Date</span>
          <span>{new Date(txn.date).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
        </div>
        <div className="ck-result-row">
          <span>Status</span>
          <span style={{ color: ok ? "var(--green)" : "var(--accent)", fontWeight: 700 }}>
            {ok ? "Approved" : "Declined"}
          </span>
        </div>
      </div>

      {ok ? (
        <motion.button className="ck-pay-btn" whileTap={{ scale: 0.97 }} onClick={onDone}>
          Back to Plans
        </motion.button>
      ) : (
        <div className="ck-result-actions">
          <motion.button className="ck-pay-btn" whileTap={{ scale: 0.97 }} onClick={onRetry}>
            Try Again
          </motion.button>
          <motion.button className="ck-ghost-btn" whileTap={{ scale: 0.97 }} onClick={onDone}>
            Back to Plans
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

/* ── PayPal modal ───────────────────────────────────────────────────── */
function PayPalModal({ price, onConfirm, onClose }) {
  return (
    <motion.div
      className="ck-paypal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ck-paypal-modal"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <button className="ck-paypal-close" onClick={onClose}>✕</button>

        <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, padding: "6px 12px", marginBottom: 12, fontSize: "0.78rem", color: "#856404", textAlign: "center" }}>
          ⚠ DEMO ONLY — No real payment is processed
        </div>

        <img src="/paypal.png" alt="PayPal" className="ck-paypal-logo" />
        <p className="ck-paypal-title">Log in to your PayPal account</p>
        <p className="ck-paypal-subtitle">to pay <strong>{price}</strong> to GymPulse</p>

        <div className="ck-paypal-form">
          <motion.button
            className="ck-paypal-login-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onConfirm}
          >
            Confirm Payment (Demo)
          </motion.button>
        </div>

        <p className="ck-paypal-footer">
          🔒 This is a simulated checkout for demonstration purposes only.
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ── Main Checkout ──────────────────────────────────────────────────── */
export default function Checkout({ plan, onBack, onDone }) {
  const [method,   setMethod]   = useState(null); // "visa" | "mastercard" | "paypal"
  const [cardNum,  setCardNum]  = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry,   setExpiry]   = useState("");
  const [cvv,      setCvv]      = useState("");
  const [errors,   setErrors]   = useState({});
  const [phase,    setPhase]    = useState("form"); // "form" | "paypal" | "processing" | "success" | "failure"
  const [txn,      setTxn]      = useState(null);

  if (!plan) {
    onBack?.();
    return null;
  }

  const price    = plan.price;
  const planName = plan.name;
  const period   = plan.period;

  function clearErr(key) {
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  }

  function validate() {
    const errs = {};
    const raw = cardNum.replace(/\s/g, "");
    if (raw.length !== 16)              errs.cardNum  = "Card number must be 16 digits.";
    if (!cardName.trim())               errs.cardName = "Name on card is required.";
    if (!/^\d{2}\/\d{2}$/.test(expiry)) errs.expiry  = "Use MM/YY format.";
    if (!/^\d{3,4}$/.test(cvv))         errs.cvv     = "CVV must be 3–4 digits.";
    return errs;
  }

  function runProcessing(detectedMethod, status) {
    setPhase("processing");
    setTimeout(() => {
      const t = {
        id:     genTxnId(),
        method: detectedMethod,
        status,
        amount: price,
        plan:   planName,
        date:   new Date().toISOString(),
      };
      saveTransaction(t);
      setTxn(t);
      setPhase(status === "success" ? "success" : "failure");
    }, 2400);
  }

  function handleCardSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const raw = cardNum.replace(/\s/g, "");
    const detected = TEST_CARDS[raw];
    if (detected) {
      runProcessing(detected, "success");
    } else {
      const guess = raw.startsWith("4") ? "Visa" : raw.startsWith("5") ? "MasterCard" : "Card";
      runProcessing(guess, "failed");
    }
  }

  function handlePayPalConfirm() {
    setPhase("processing");
    setTimeout(() => {
      const t = {
        id:     genTxnId(),
        method: "PayPal",
        status: "success",
        amount: price,
        plan:   planName,
        date:   new Date().toISOString(),
      };
      saveTransaction(t);
      setTxn(t);
      setPhase("success");
    }, 2400);
  }

  function reset() {
    setPhase("form"); setMethod(null);
    setCardNum(""); setCardName(""); setExpiry(""); setCvv("");
    setErrors({}); setTxn(null);
  }

  /* ── Render phases ── */
  if (phase === "processing") return <Processing />;
  if (phase === "success" || phase === "failure")
    return <Result txn={txn} onRetry={reset} onDone={onDone} />;

  return (
    <div className="ck-page">

      {/* ── Top bar ── */}
      <div className="ck-topbar">
        <button className="ck-back-btn" onClick={onBack}>← Back to Plans</button>
        <div className="ck-secure-badge">
          <span>🔒</span>
          <span>Secure Checkout · 256-bit SSL</span>
        </div>
      </div>

      <div className="ck-container">
        <motion.h1
          className="ck-heading"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          Complete Your Order
        </motion.h1>

        {/* ── Order summary ── */}
        <motion.div
          className="ck-summary"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="ck-section-label">ORDER SUMMARY</p>
          <div className="ck-summary-body">
            <div>
              <div className="ck-summary-plan">{planName}</div>
              <div className="ck-summary-period">{period}</div>
            </div>
            <div className="ck-summary-price">{price}</div>
          </div>
          <div className="ck-divider" />
          <div className="ck-summary-total">
            <span>Total Due Today</span>
            <span className="ck-summary-total-price">{price}</span>
          </div>
        </motion.div>

        {/* ── Payment panel ── */}
        <motion.div
          className="ck-panel"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="ck-section-label">PAYMENT METHOD</p>

          <div className="ck-methods">
            {[
              { id: "visa",       img: "/visa.png",       label: "Visa" },
              { id: "mastercard", img: "/mastercard.png", label: "MasterCard" },
              { id: "paypal",     img: "/paypal.png",     label: "PayPal" },
            ].map(m => (
              <button
                key={m.id}
                className={`ck-method-btn ${method === m.id ? "active" : ""}`}
                onClick={() => {
                  setMethod(m.id);
                  setErrors({});
                  if (m.id === "paypal") setPhase("paypal");
                  else setPhase("form");
                }}
              >
                <img src={m.img} alt={m.label} className="ck-method-img" />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Card form */}
          <AnimatePresence mode="wait">
            {(method === "visa" || method === "mastercard") && (
              <motion.form
                key="card-form"
                className="ck-card-form"
                onSubmit={handleCardSubmit}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28 }}
              >
                <div className="ck-field">
                  <label>Card Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardNum}
                    onChange={e => { setCardNum(formatCard(e.target.value)); clearErr("cardNum"); }}
                    placeholder="1234 5678 9012 3456"
                    className={errors.cardNum ? "ck-input-err" : ""}
                    maxLength={19}
                    autoComplete="cc-number"
                  />
                  {errors.cardNum && <span className="ck-err">{errors.cardNum}</span>}
                </div>

                <div className="ck-field">
                  <label>Name on Card</label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={e => { setCardName(e.target.value); clearErr("cardName"); }}
                    placeholder="John Doe"
                    className={errors.cardName ? "ck-input-err" : ""}
                    autoComplete="cc-name"
                  />
                  {errors.cardName && <span className="ck-err">{errors.cardName}</span>}
                </div>

                <div className="ck-field-row">
                  <div className="ck-field">
                    <label>Expiry Date</label>
                    <input
                      type="text"
                      value={expiry}
                      onChange={e => { setExpiry(formatExpiry(e.target.value)); clearErr("expiry"); }}
                      placeholder="MM/YY"
                      className={errors.expiry ? "ck-input-err" : ""}
                      maxLength={5}
                      autoComplete="cc-exp"
                    />
                    {errors.expiry && <span className="ck-err">{errors.expiry}</span>}
                  </div>
                  <div className="ck-field">
                    <label>CVV</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cvv}
                      onChange={e => { setCvv(e.target.value.replace(/\D/g, "").slice(0, 4)); clearErr("cvv"); }}
                      placeholder="123"
                      className={errors.cvv ? "ck-input-err" : ""}
                      maxLength={4}
                      autoComplete="cc-csc"
                    />
                    {errors.cvv && <span className="ck-err">{errors.cvv}</span>}
                  </div>
                </div>

                <motion.button
                  type="submit"
                  className="ck-pay-btn"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  💳 Pay {price}
                </motion.button>
              </motion.form>
            )}

            {!method && (
              <motion.p
                key="hint"
                className="ck-method-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Select a payment method above to continue.
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── PayPal modal ── */}
      <AnimatePresence>
        {phase === "paypal" && (
          <PayPalModal
            price={price}
            onConfirm={handlePayPalConfirm}
            onClose={() => { setPhase("form"); setMethod(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
