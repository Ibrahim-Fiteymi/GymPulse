export default function MetricCard({ label, value, hint }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <h3>{value}</h3>
      <p className="metric-hint">{hint}</p>
    </article>
  )
}
