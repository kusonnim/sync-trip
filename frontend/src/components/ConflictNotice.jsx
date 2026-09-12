// PROJECT.md ③ 의 실패 응답을 그린다.
// "가능한 루트가 없습니다" 대신 어느 장소가 부딪히는지 짚어주는 것이 이 화면의 목적이다.
export default function ConflictNotice({ error, places = [] }) {
  if (!error) return null;

  const titles = {
    TIME_CONFLICT: '예약 시간이 서로 부딪힙니다',
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
                {p.fixedTime ? ` ${p.fixedTime}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
