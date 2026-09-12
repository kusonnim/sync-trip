// Render the failure response from PROJECT.md section 3.
// The goal is to name the conflicting places instead of showing a generic no-route message.
export default function ConflictNotice({ error, places = [] }) {
  if (!error) return null;

  const titles = {
    TIME_CONFLICT: 'Reservation Times Conflict',
    NO_ROUTE: 'No Route Fits the Available Time',
    REQUEST_FAILED: 'Route Calculation Failed',
  };
  const named = places.filter((p) => error.placeIds?.includes(p.id));

  return (
    <>
      <div className="notice error">
        <strong>{titles[error.code] ?? 'We Could Not Build an Itinerary'}</strong>
        <div style={{ marginTop: 4 }}>{error.message}</div>
      </div>
      {named.length > 0 && (
        <div className="card">
          <div className="card-title">Places to Adjust</div>
          <div className="chips">
            {named.map((p) => (
              <span className="chip accent" key={p.id}>
                {p.name}
                {p.fixedTime ? ` ${p.fixedTime}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
