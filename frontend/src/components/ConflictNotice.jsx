// Render the failure response from PROJECT.md section 3.
// The goal is to name the conflicting places instead of showing a generic no-route message.
export default function ConflictNotice({ error, places = [] }) {
  if (!error) return null;

  const titles = {
    TIME_CONFLICT: '방문 시간이 서로 부딪힙니다',
    NO_ROUTE: '시간 안에 들어가는 순서가 없습니다',
    REQUEST_FAILED: '경로를 계산하지 못했습니다',
  };
  const named = places.filter((p) => error.placeIds?.includes(p.id));

  return (
    <>
      <div className="notice error">
        <strong>{titles[error.code] ?? '일정을 만들지 못했습니다'}</strong>
        <div style={{ marginTop: 4 }}>{error.message}</div>
      </div>
      {named.length > 0 && (
        <div className="card">
          <div className="card-title">고쳐야 할 장소</div>
          <div className="chips">
            {named.map((p) => (
              <span className="chip accent" key={p.id}>
                {p.name}
                {p.visitWindow ? ` ${p.visitWindow.start}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
