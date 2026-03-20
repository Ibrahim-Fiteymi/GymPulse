const statusMap = {
  available: 'status-available',
  in_use: 'status-in-use',
  reserved: 'status-reserved',
  maintenance: 'status-maintenance',
}

export default function EquipmentCard({ equipment }) {
  return (
    <article className="equipment-card">
      <div className="equipment-card-top">
        <div>
          <p className="equipment-category">{equipment.category}</p>
          <h3>{equipment.name}</h3>
        </div>
        <span className={`status-pill ${statusMap[equipment.status] || ''}`}>{equipment.status}</span>
      </div>
      <p className="subtle">{equipment.zone}</p>
      <p>{equipment.description || 'No description available.'}</p>
    </article>
  )
}
