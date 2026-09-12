# SyncTrip

소셜 투표 기반 시간제약 여행 동선 최적화 서비스.

여러 명이 각자 가고 싶은 곳을 순위로 내면 선호 점수로 후보를 좁히고,
영업시간과 예약 시간을 지키면서 최소 시간과 최소 비용 두 가지 일자별 타임라인을 만들어
팀이 투표로 확정한다.

## 지금 상태

프론트엔드는 백엔드 없이 열 단계가 끝까지 돌아간다. 백엔드는 아직 없다.

| 부분 | 상태 |
|---|---|
| 프론트엔드 화면 10단계 | 됨 |
| 최적화 엔진 | 프론트에 임시 구현. 제약 검증 14개 통과 |
| 방 상태 실시간 동기화 | localStorage 로 동작. 같은 브라우저의 다른 탭끼리 동기화됨 |
| Firestore | 미연결 |
| FastAPI 백엔드 | 없음 |
| 카카오·ODsay·구글 실제 API | 미연결. 목업 데이터와 거리 기반 추정치를 씀 |
| 지도, 결과 이미지 저장 | 없음 |

## 실행

```bash
cd frontend
npm install
npm run dev     # 개발 서버
npm run check   # 최적화 제약 검증 14가지
npm run build   # 배포 빌드
```

## 문서

| 파일 | 내용 |
|---|---|
| [PROJECT.md](PROJECT.md) | 팀 규약. API 명세와 알고리즘 기준. 다른 문서와 어긋나면 이 문서를 따른다 |
| [docs/PRD.md](docs/PRD.md) | 제품 정의서. 플로우, 데이터 모델, 실행 순서, 검증 |
| [frontend/README.md](frontend/README.md) | 프론트 구조와 백엔드 연결 지점 |
| [docs/reference/기획서.txt](docs/reference/기획서.txt) | 원본 기획서 |
| [docs/reference/기획서-손글씨.jpg](docs/reference/기획서-손글씨.jpg) | 입출력 정의 손글씨 메모 |
| [docs/reference/사용자-흐름도.png](docs/reference/사용자-흐름도.png) | 10단계 사용자 흐름도 |

## 스택

- 프론트엔드: React + Vite, Vercel 배포
- 실시간 동기화: Firebase Firestore (예정)
- 백엔드: Python FastAPI (예정)
- 외부 API: 카카오 로컬(장소 검색), 카카오모빌리티(자차), ODsay(대중교통), 구글 Places(영업시간)

## 구조

```
frontend/           React 앱 (있음)
  src/screens/      화면 하나당 파일 하나
  src/components/   타임라인, 경로 카드, 충돌 안내
  src/lib/          최적화 엔진, 방 저장소, API 클라이언트
  scripts/          제약 검증 스크립트
backend/            FastAPI 서버, 최적화 엔진 (아직 없음)
docs/               PRD와 원본 자료
```

## 백엔드 붙이는 순서

프론트는 이미 PROJECT.md 4절 규약대로 보내고 받는다. 백엔드가 생기면 두 군데만 바꾸면 된다.

1. `frontend/.env` 에 `VITE_API_BASE` 를 넣으면 임시 엔진이 꺼지고 실제 백엔드를 부른다.
2. `frontend/src/lib/roomStore.js` 의 함수 본문을 Firestore 호출로 교체한다. 화면 코드는 손대지 않는다.

## 키 관리

외부 API 키는 전부 백엔드 환경변수에만 둔다. 프론트엔드에는 Firebase 웹 설정만 둔다.
Vite의 `VITE_` 접두사에는 어떤 외부 API 키도 넣지 않는다. 빌드 결과물에 그대로 박히기 때문이다.
