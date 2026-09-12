# SyncTrip Design Reference

## What It Is

A group of travelers each rank the places they want to visit. SyncTrip adds those rankings up,
keeps the highest-scoring places, and builds day-by-day itineraries that respect business hours
and any visit time someone has locked in. The group votes on the result and confirms one plan.

The interface is Korean because the product serves Korean travelers. This document, code comments,
and the rest of the repository documentation are English.

---

## Screens

Ten steps from the user flow diagram are grouped into six screens. A room carries a status, everyone
subscribes to it, and the host moving forward advances every member's screen at the same time.

### 1. Landing

The wordmark "SyncTrip" sits centered in brand slate above the line
"같이 가는 여행, 동선까지 같이 정하기".
An intro card explains the service and carries three tags: "투표로 장소 선정", "시간 제약 반영",
"대중교통 노선까지". Below them sits the primary button, "여행 만들기".

A second card, "초대받으셨나요?", pairs a four-character room code field with an "입장" button.

### 2. Trip Basics

Titled "여행 기본정보" with the note "대표자가 먼저 입력합니다". Only the host sees it. Three cards:

- Nickname and trip name
- "날짜와 시간" holds start date, end date, "하루 시작" and "귀가 마감" in a two-by-two grid, plus a
  line telling the host how many days that adds up to
- "인원과 이동수단" holds headcount and a two-way toggle between "🚌 대중교통" and "🚗 자차"
- "출발지와 도착지" holds the origin and final destination

The footer button reads "여행방 만들기".

### 3. Waiting Room

Titled "팀원을 기다리는 중". The four-character room code is the largest text on the screen, set in
brand slate with wide letter spacing, above a "🔗 초대 링크 복사" button that confirms with
"링크를 복사했어요" in green.

A "참여자" card counts arrivals against the expected headcount on its right edge and lists each
nickname as a chip, with a crown on the host. A "이렇게 진행됩니다" card numbers the three rules:
rank three places, score them 3/2/1, then vote between two routes.

The host's button reads "희망지 입력 시작하기", or "N명으로 먼저 시작하기" when people are still missing.
Members see a disabled button instead: "대표자가 시작하기를 누르면 넘어갑니다".

### 4. Join

Titled with the trip name and the room code. One field, "닉네임을 입력해 주세요", and a card showing
who is already inside. The button reads "참여하기" and uses the brick accent.

### 5. Choosing Places

Titled "가고 싶은 곳 고르기". The subtitle counts three things at once: places added, your own ranking
out of three, and how many members have submitted.

Three cards stack down the screen:

- **장소 검색** — a search field, a note that adding is unlimited while only three get ranked, and
  results that each carry a "담기" tag
- **내 순위** — up to three rows. Each puts a numbered slate circle, the place name, its hours, and
  the rank label on one line, then a row of pill buttons below: "위로", "아래로", "시간" (host only),
  and "빼기"
- **담은 곳** — everything not in your ranking, with a count on the card's right edge. Each row offers
  a filled "순위에" pill plus "시간" and "삭제" for the host. When the ranking is full, a brick strip
  appears rather than the click being silently ignored

Opening "시간" reveals an editor below both lists, so a ranked place can be edited too. It names where
the hours came from in a brown strip, then a two-by-two grid of "여는 시각", "닫는 시각",
"이 시각부터" and "이 시각까지", a stay length in minutes, and a "필수로 방문하기" toggle that gains a
check mark when on.

The member button reads "N곳 순위 제출하기". Once the host has submitted, theirs becomes
"의견 취합하고 경로 만들기 (N명 제출)" in the brick accent.

### 6. Analyzing

Titled "의견을 취합하고 있어요". Four steps tick over one at a time. A pending step shows its number
in a grey circle; a finished one turns into a green check: 선호 점수 계산, 방문 후보 정리,
이동시간·비용 분석, 최적 경로 2안 생성.

A "이번 계산에 쓰인 조건" card repeats the trip settings as chips, with the deadline in brick.

### 7. Comparing and Confirming

Titled "어느 일정으로 갈까요" with a vote counter. Two route cards appear: "최소 시간" in brand slate
tagged "추천", and "최소 비용" in brick tagged "알뜰". Each shows 이동 시간, 예상 요금 and 장소, adding a
"대기" figure in brown when the itinerary waits more than half an hour. The card you voted for takes
its own color as a border.

"일정 보기" expands a vertical timeline built on a real rail: a dot per entry joined by a hairline.
Stop times sit in brand slate, and travel legs sit in grey strips carrying the mode, the fare, and the
duration. A stop notes its category, how long you stay, and flags a scheduled visit or a long wait in
brown.

Each card ends with "이 안에 투표하기", which flips to "이 안에 투표함" once cast. The host closes with
"최다 득표안으로 확정하기".

When only one itinerary survives the constraints, the screen says so instead of showing two identical
cards.

### Confirmed and Failure States

Confirmation retitles the screen "이 일정으로 확정했어요", swaps in a green banner naming the chosen
plan with its totals, keeps only the winning card with its timeline open, and offers a green
"일정 링크 공유하기" button.

When no itinerary is possible the screen reads "일정을 만들지 못했어요" and names the two places whose
times collide in brick, lists them under "고쳐야 할 장소", and offers a button back to editing.

### Debug Card

Hidden unless the address carries a debug flag. Holds "5명짜리 데모 방 만들기",
"이 브라우저의 방 모두 지우기", and "디버그 모드 끄기".

---

## Colors

| Role | Hex | Where it shows |
|---|---|---|
| Page background | `#eeeeef` | Behind the app frame |
| App frame | `#f7f7f8` | The single card every screen lives in |
| Card surface | `#ffffff` | Every card and list row |
| Border | `#e4e5e8` | Frame and card edges, input outlines |
| Primary text | `#232529` | Titles, place names, values |
| Secondary text | `#70747c` | Subtitles, field labels, body copy |
| Faint text | `#9c9fa6` | Row metadata, hints, counts, empty states |
| Brand slate | `#53699e` | Primary buttons, room code, rank circles, timeline times |
| Brand tint | `#eef1f7` | Selected toggles, default chips, focus ring |
| Brick accent | `#a85a4b` | Join and build buttons, conflict copy, the cost route |
| Brick tint | `#f7efec` | Accent chips, the ranking-full notice |
| Green | `#3f7157` | Completed steps, the confirmation banner |
| Green tint | `#eef4f0` | Confirmation banner background |
| Brown | `#8a6534` | Long waits, scheduled-visit flags, the hours-source notice |
| Brown tint | `#f6f2ea` | Hours-source notice background |
| Strip grey | `#f1f1f3` | Travel legs on the timeline, pending step dots |

The palette is muted throughout; nothing is fully saturated. Slate carries normal progress and brick
marks the moments that need a decision. Green appears only when something is finished, brown only
when something deserves a second look.

---

## Type

One family throughout, falling back through the system stack:

> Pretendard, then the platform UI font, then Apple SD Gothic Neo, then Malgun Gothic

Pretendard is loaded from a CDN rather than left to chance in the fallback stack.
No second family and no display face. Weight and size carry the hierarchy instead.

| Element | Size | Weight |
|---|---|---|
| Landing wordmark | 32px | 800 |
| Room code | 34px | 800 |
| Screen title | 18px | 700 |
| Card title | 15px | 700 |
| Input text | 15px | regular |
| Place name | 14px | 600 |
| Field label | 13px | 600 |
| Screen subtitle | 13px | regular |
| Timeline time | 13px | 700 |
| Row metadata | 12px | regular |
| Chip, tag, pill button | 12px | 600-700 |

---

## Shape and Layout

Built for a phone. The whole app lives inside one framed card capped at 480px, centered on wider
screens against a slightly darker page. The primary action sticks to the foot of that frame above a
fade, so it never floats loose over the page.

The frame uses a 24px radius and a deeper shadow. Cards inside use 16px and a lighter one, which puts
the frame one layer above the page and the cards one layer above the frame. Inputs and buttons use
10 to 12px. Chips and row buttons are fully rounded.

Row buttons are pills rather than rectangles, and rows wrap, which keeps the controls readable when a
place name runs long or the screen is narrow. A ranked place shows its information on one line and
its controls on the next.

The timeline draws a real rail: a dot per entry joined by a hairline, with travel legs sitting in grey
strips beside it.
