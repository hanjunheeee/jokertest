# 밤 턴 연출을 역할 생존과 분리한다 — 구현 계획

## 1. 진단: 어느 경로가 안내를 결정하는가

직접 코드를 따라간 결과, **현재 턴 안내의 유일한 출처는 backend의 canonical 턴 커서 하나**이고, frontend는 그 값을 그대로 비추기만 한다.

**backend 경로**

- `backend/game-core/gameSession.js:1103 getLivingNightTurnActorUuids` — 그 역할 보유자 중 **`player.alive`인 사람만** 모은다.
- `:1120 computeCurrentNightTurnRole` — 위 목록이 비면 `continue`(zero-actor auto-skip). 즉 **보유자가 전원 사망한 역할은 canonical 턴 후보에서 통째로 사라진다.**
- `:1175 buildNightTurnChangedPayload` — `nightTurnRole: computeCurrentNightTurnRole(session)`.
- `backend/socket/gameSession.js:355-384` — 제출 후 턴이 실제로 바뀐 경우에만 `night_turn_changed`를 참가자 전원에게 1회 방송한다.

**frontend 경로**

- `frontend/src/domains/game/ingame/store/ingameStore.js:202 applyNightTurnChanged` → `state.nightTurnRole`.
- `.../utils/selectInGameNightTurnRole.js:24` — `state.nightTurnRole`이 있으면 그 값, 없으면 `getInGameOpeningNightTurnRole(dayIndex)`(= 그 밤의 첫 역할 하나).
- 오버레이: `.../hooks/useInGameNightTurnAnnouncement.js:59` 가 위 selector 하나만 읽는다.
- 상태바: `.../utils/selectInGameTimebarStatusMessage.js:32` 도 같은 selector를 읽는다.

**결론 — 원인은 backend다.** GUARD 보유자가 전원 죽으면 `computeCurrentNightTurnRole`이 GUARD를 건너뛰므로 `night_turn_changed(nightTurnRole:'GUARD')`가 **애초에 방송되지 않는다.** frontend에는 그 턴이 존재했다는 사실을 알 방법이 하나도 없다 — 프런트는 **역할 구성(어떤 행동 역할이 이 게임에 존재하는지)을 전혀 모른다.** `roleComposition`은 setup 도메인에만 있고(`frontend/src/domains/game/setup/**`), 인게임 store/공개 payload에는 없다(`backend/game-core/gameSession.js:552` — "어떤 공개 payload에도 포함하지 않는다").

그리고 이 생존 필터는 **버그가 아니라 판정의 핵심**이다(`:938-951`의 주석 — 죽은 배우를 기다리면 그 밤이 구조적으로 끝나지 않는다). 그러므로 고칠 것은 필터가 아니라 **"판정 커서를 연출의 출처로 재사용한 것"** 이다.

## 2. 설계 결정

**연출을 판정 커서에서 완전히 떼어낸다.**

- **판정(무변경):** `getEligibleNightActorUuids` / `getLivingNightTurnActorUuids` / `computeCurrentNightTurnRole` / `checkNightTurnGate` / `prepareNightResolution` / `night_turn_changed` 방송 / 밤 행동 패널의 턴 게이트(`useInGameActionPanel.js:151-152`가 읽는 `selectInGameNightTurnRole`) — **한 줄도 건드리지 않는다.**
- **연출(신규):** 그 밤에 재생할 역할 순서를 담은 **릴(reel)** 을 만들고, 오버레이와 상태바가 그 릴만 따라간다. 릴은 `광대→의사→경호원→마녀사냥꾼` 고정 순서에서 **① 역할 구성에 실제로 존재하는 역할** ∩ **② 그 밤에 안내 가능한 역할(마녀사냥꾼은 시신이 있는 밤만)** 로 필터한 목록이며, **보유자 생사를 전혀 참조하지 않는다.** 릴 커서는 `INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS`(2600ms) 타이머로만 한 칸씩 전진하고 마지막 칸에서 멈춘다.

**왜 canonical 턴을 "가속기"로 쓰지 않는가 (요구사항 2의 괄호 부분에 대한 판단).**
"canonical 진행상 다음으로 넘어가면 앞당긴다"를 넣으면, canonical은 죽은 역할을 **건너뛴 값**이므로 앞 역할이 2.6초 안에 제출한 밤에는 죽은 역할의 칸이 다시 사라진다 — 누출이 타이밍 의존으로 되살아난다. 반대로 canonical을 **하한(기다리기)** 으로 쓰면, 그 밤의 마지막 생존 역할이 제출하는 순간 서버가 즉시 판정 → `enterDayPhase`(`backend/game-core/gameSession.js:1365`)로 phase가 DAY가 되어, **그 뒤에 남은 역할(대부분의 구성에서 GUARD가 바로 이 자리다 — `roleComposition.js:39-44`상 WITCH_HUNTER는 10인 이상에서만 등장)** 의 연출이 통째로 잘린다. 즉 이번 요구사항이 신고한 바로 그 사례를 못 고친다. 판정 타이밍을 늦추는 것은 금지 범위이므로, **연출은 canonical과 동기화하지 않고 독립된 고정 리듬으로 재생한다** — 요구사항의 "항상 같은 순서·리듬으로 재생돼야 한다"가 그대로 이 결론이다.

**의도된 결과(명시):** 릴이 끝난 뒤에도 밤이 계속되면 상태바는 **릴의 마지막 역할 문구를 그대로 유지**한다. 이 값은 (구성 + 시신 존재 + 시간)만의 함수라 누구의 생사도 드러내지 않는다. "지금 내 차례인가"는 기존대로 **행동 패널**이 canonical 턴으로 알려준다(요구사항 3의 기존 동작 그대로).

**공개 데이터 판단.** 프런트에 새로 내려주는 값은 `state.nightTurnRoles` — "이 게임에 존재하는 행동 역할 목록"(생사·인원수 없음)이다. 첫 밤에는 모든 역할에 생존 보유자가 있으므로 **오늘도 이미 `night_turn_changed` 시퀀스가 이 집합을 전원에게 그대로 노출한다.** 새 비밀을 여는 것이 아니라 이미 공개인 사실을 한 번에 주는 것이다.

## 3. 파일별 변경

### 3.1 `backend/game-core/gameSession.js` (MODIFY)

1. `NIGHT_TURN_ROLE_ORDER`(`:1098`) 바로 아래에 **새 순수 함수** 추가:

```js
// 연출 전용 — 이 세션의 역할 구성에 실제로 존재하는 밤 행동 역할을 canonical 순서로 돌려준다.
// alive를 절대 보지 않는다: 보유자가 전원 죽어도 목록에서 빠지지 않는다(그 사실 자체가 비밀이다).
// 판정 경로(getLivingNightTurnActorUuids·computeCurrentNightTurnRole)와는 완전히 별개이며,
// 이 함수는 어떤 판정에도 쓰이지 않는다.
function getSessionNightTurnRoles(session) { /* NIGHT_TURN_ROLE_ORDER.filter(보유자 1명 이상) */ }
```

- `session.roleComposition`이 아니라 `session.players`를 훑어 판정한다(구성 필드는 내부 전용이고, players가 실제 배정의 단일 원천이다).
- `isEligibleForNightAction`을 여기서 호출하지 않는다 — 그 밤 조건(마녀사냥꾼 시신 규칙)은 프런트가 공개 roster로 매 밤 판단한다. 이 값은 **게임당 상수**다.

2. `buildGameStartedPayload`(`:815`)의 `state`에 `nightTurnRoles: getSessionNightTurnRoles(session)` 추가. `state.self`/`state.players`의 키 집합은 그대로다(기존 엄격 검증 테스트 `__tests__/gameSession.test.js:1464`, `:4253`에 영향 없음).
3. `module.exports`에 `getSessionNightTurnRoles` 추가.

**건드리지 않는 것:** `getEligibleNightActorUuids`, `isEligibleForNightAction`, `getLivingNightTurnActorUuids`, `computeCurrentNightTurnRole`, `checkNightTurnGate`, `buildNightTurnChangedPayload`, `prepareNightResolution`, `commitNightResolution`, `buildSessionSnapshot`(스냅샷 키 집합을 강하게 검증하는 테스트가 다수라 손대지 않는다 — 3.7 참조).

### 3.2 `frontend/.../constants/nightTurn/ingameNightTurnAnnouncement.js` (MODIFY)

- 새 함수 `buildInGameNightTurnReel(nightTurnRoles, dayIndex, { hasDeadPlayer })`:
  `INGAME_NIGHT_TURN_ANNOUNCEMENTS`의 순서를 기준으로, ① `nightTurnRoles`(문자열 배열)에 포함되고 ② `isInGameAnnounceableNightTurnRole(role, dayIndex)`이고 ③ `WITCH_HUNTER`면 `hasDeadPlayer === true`인 역할만 남긴 **문자열 배열**을 돌려준다.
  `nightTurnRoles`가 배열이 아니거나 비면(구버전 payload) **네 역할 전체**를 후보로 삼는다(②③은 그대로 적용) — "구성을 모르면 덜 감추지 말고 더 재생한다"가 안전한 기본값이다.
- `getInGameOpeningNightTurnRole`/`getInGameNightTurnAnnouncement`/`isInGameAnnounceableNightTurnRole`/`DURATION`/문구 상수는 그대로 둔다(`selectInGameNightTurnRole`이 계속 쓴다).
- 파일 상단 주석에서 "마녀사냥꾼은 서버가 턴을 만들지 않으므로 오지 않는다"는 설명을 릴 기준으로 갱신한다.

### 3.3 `frontend/.../utils/selectInGameNightTurnReel.js` (CREATE)

```js
export function selectInGameNightTurnReel(state) // → string[]
```
- `state`가 없거나 `phase !== "NIGHT"`거나 `dayIndex`가 유효한 비음수 정수가 아니면 `[]`.
- `hasDeadPlayer` = `state.players`에 `alive === false`인 원소가 하나라도 있는가(서버 `hasAnyDeadPlayer`의 공개 roster 사본 — roster의 생사는 이미 전원 공개 정보다).
- `buildInGameNightTurnReel(state.nightTurnRoles, state.dayIndex, { hasDeadPlayer })`를 그대로 반환.
- 이 파일은 **생사에 따라 역할을 빼지 않는다**는 계약을 주석으로 못박는다.

### 3.4 `frontend/.../hooks/useInGameNightTurnAnnouncement.js` (MODIFY)

- 입력을 `selectInGameNightTurnRole` → `selectInGameNightTurnReel`로 바꾼다. 배열 참조 churn을 막기 위해 **`reelKey = roles.join("|")`** 문자열을 만들고 effect deps에는 이 문자열만 쓴다.
- 훅 로컬 상태로 **릴 커서**를 둔다: `{ key: `${scope}#${dayIndex}#${reelKey}`, index }`.
  - key가 바뀌면 `index = 0`으로 리셋.
  - `hydrated`(스냅샷 복원)면 `index = roles.length - 1`로 점프한다 — 이미 진행 중인 밤에 복원된 클라이언트가 지나간 안내를 몰아 재생하지 않는다(기존 하이드레이션 계약 유지). 그 identity는 기존대로 `hydrated`로 들어가 baseline으로만 등록된다.
  - 전진 타이머: `hold === false`이고 `index < roles.length - 1`일 때만 `setTimeout(DURATION)` → `index + 1`. `hold`(역할 공개·사망 연출·개인 결과·진입 연출) 동안에는 전진하지 않는다 — "밤이 되었습니다"를 닫은 뒤에 릴이 시작한다는 기존 순서가 그대로 유지된다.
  - **닫기(확인 버튼)는 커서를 전진시키지 않는다.** 지금 카드를 숨길 뿐이며(기존 `dismiss` 그대로), 리듬은 모든 창에서 동일하게 유지된다.
- `role = roles[index] ?? null`을 기존 `nightTurnRole` 자리에 넣어 `buildInGameNightTurnAnnouncementIdentity(scope, dayIndex, role)`에 그대로 넘긴다. 릴 안에 같은 역할이 두 번 없으므로 `scope#dayIndex#role` identity는 릴 단계마다 유일하다 — **`buildInGameNightTurnAnnouncementIdentity`와 `reduceInGameNightTurnAnnouncement`의 로직은 그대로 재사용한다.**
- 반환값에 **`statusRole`**(= 커서가 가리키는 릴 역할, 오버레이의 열림/닫힘과 무관)을 추가한다. 기존 `open/announcement/identity/role/close`는 그대로 유지.

### 3.5 `frontend/.../utils/selectInGameTimebarStatusMessage.js` (MODIFY)

- 시그니처를 `selectInGameTimebarStatusMessage(state, nightTurnRoleOverride = null)`로 넓힌다.
- `phase === "NIGHT"`이면 `nightTurnRoleOverride`가 유효한 문자열일 때 그 역할의 문구를, 아니면 기존 `selectInGameNightTurnRole(state)` 경로를 쓴다(1-인자 호출부·기존 테스트 하위호환).
- DAY/TRIBUNAL/그 외 분기는 무변경.

### 3.6 `frontend/.../pages/InGamePage.jsx` (MODIFY)

- `:97` `statusMessage={selectInGameTimebarStatusMessage(gameState)}` → `selectInGameTimebarStatusMessage(gameState, nightTurn.statusRole)`.
- 이미 `useInGameOverlayStack()`에서 `nightTurn`을 받고 있으므로 배선 추가는 이 한 줄뿐이다. `useInGameOverlayStack.js`는 변경 없음(hold 관계 그대로).
- (`components/InGamePlayArea.jsx`는 어느 곳에서도 렌더되지 않는 미사용 컴포넌트라 손대지 않는다 — 1-인자 하위호환 덕에 그대로 동작한다.)

### 3.7 `frontend/.../store/applySessionSnapshot.js` (MODIFY)

- `nextState`에 `nightTurnRoles: current.state.nightTurnRoles`를 이어받게 한다. 이 값은 **게임당 상수**이고 `response.gameId === current.gameId`가 이미 검증된 뒤이므로 안전하다.
- 이렇게 하면 backend 스냅샷 payload를 바꾸지 않아도 재접속 후 릴이 그대로 유지된다(스냅샷 키 집합을 엄격 검증하는 backend 테스트 6곳을 건드리지 않는 이유다). 스토어가 비어 있는 완전 새로고침은 `InGamePage`가 `/multiplay`로 되돌리므로 이 경로로 오지 않는다.
- 다른 store 액션은 전부 `{...current.state, ...}` 패턴이라 `nightTurnRoles`가 자동 보존된다 — 추가 변경 없음.

### 3.8 문서 주석만 갱신 (MODIFY, 동작 무변경)

- `frontend/.../utils/selectInGameNightTurnRole.js` — "이 파일이 현재 역할 턴의 유일한 출처다"는 이제 **판정(행동 패널 턴 게이트) 전용**이다. 연출은 `selectInGameNightTurnReel`이 담당한다고 명시.
- `frontend/.../utils/reduceInGameNightTurnAnnouncement.js` — 입력 `role`이 canonical 턴이 아니라 **릴 커서가 가리키는 연출 역할**임을 명시(상태 기계 로직은 그대로).

## 4. 테스트

### backend — `backend/game-core/__tests__/gameSession.test.js` (MODIFY)

1. `getSessionNightTurnRoles`: 구성에 있는 행동 역할만 canonical 순서로 반환하고 CITIZEN은 없다.
2. `getSessionNightTurnRoles`: **그 역할 보유자를 전원 `alive=false`로 만들어도 목록이 그대로다**(핵심 회귀 방어). 같은 세션에서 `computeCurrentNightTurnRole`은 그 역할을 여전히 건너뛴다 — 두 값이 의도적으로 다르다는 것을 한 테스트에서 함께 고정한다.
3. `buildGameStartedPayload`: `state.nightTurnRoles`가 위 함수 결과와 같고, viewer가 누구든 동일하며, 역할/생사/uuid는 여전히 들어 있지 않다.

**무수정 PASS로 판정 회귀를 증명:** `backend/socket/__tests__/nightTurnProgression.test.js`(죽은 DOCTOR 자동 건너뛰기·`night_turn_changed` 키 4개·자동 판정 1회)와 `backend/game-core/__tests__/gameSession.test.js`의 밤 판정 테스트 전부를 **손대지 않고** 통과시킨다.

### frontend

- `utils/__tests__/selectInGameNightTurnReel.test.js` (CREATE)
  - 구성에 GUARD가 있고 GUARD 보유자가 전원 사망해도 릴에 GUARD가 남는다.
  - 시신이 없는 밤에는 WITCH_HUNTER가 빠지고, 시신이 생긴 밤에는 **WH 보유자가 죽었어도** 들어온다.
  - `phase !== "NIGHT"` → `[]`. `nightTurnRoles` 누락 → 네 역할 폴백(WH는 시신 조건 유지).
- `hooks/__tests__/useInGameNightTurnAnnouncement.test.js` (MODIFY)
  - **핵심 시나리오:** `nightTurnRoles: ["JOKER","DOCTOR","GUARD"]`, GUARD 보유자 사망 상태의 밤에서 타이머를 2.6초씩 진행시키면 광대→의사→**경호원** 안내가 순서대로 뜨고 `statusRole`도 같은 순서로 움직인다. `night_turn_changed`를 한 번도 받지 않아도 재생된다.
  - 릴이 끝나면 `statusRole`이 마지막 역할에 고정되고 새 안내는 더 뜨지 않는다.
  - `hold`가 true인 동안 커서가 전진하지 않고, 닫기는 커서를 움직이지 않는다.
  - 스냅샷 하이드레이션으로 밤에 복원되면 지나간 안내를 재생하지 않는다(기존 계약 유지).
  - 기존 케이스 중 "canonical 턴이 바뀌어야만 다음 안내가 뜬다"를 전제한 것은 릴 기준으로 갱신한다.
- `hooks/__tests__/useInGameOverlayStack.nightTurn.test.js` (MODIFY) — "밤이 되었습니다"를 닫기 전에는 릴이 시작하지도 전진하지도 않는다는 순서 계약을 릴 기준으로 갱신.
- `utils/__tests__/selectInGameTimebarStatusMessage.test.js` / `.store.test.js` (MODIFY) — override 인자가 있으면 그 문구를, 없으면 기존 동작을 유지한다는 케이스 추가.
- `store/__tests__/applySessionSnapshot.test.js` (MODIFY) — 스냅샷 적용 후에도 `state.nightTurnRoles`가 보존된다.

### 실행 명령

- `npm --prefix backend test` (그리고 `npm run test:game-core --prefix backend`)
- `npm --prefix frontend test`

두 스위트 전체 PASS가 완료 조건이다.

## 5. 위험과 대응

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| 연출이 canonical 턴과 어긋나 살아있는 GUARD가 "마녀사냥꾼의 시간" 문구를 보며 행동 | 혼동 | 의도된 분리다. "내 차례"는 행동 패널(canonical 게이트, 무변경)이 알려준다. 오버레이/상태바는 연출 전용임을 각 파일 주석에 명시 |
| 릴이 밤보다 먼저 끝나 상태바가 마지막 역할에 고정 | UX 변화 | 값이 (구성+시신+시간)만의 함수라 누출이 없다는 점이 이 선택의 이유. 후속으로 "밤이 깊어갑니다" 같은 중립 문구를 넣고 싶다면 별도 슬라이스 |
| 프런트가 마녀사냥꾼 시신 조건을 자체 판단(서버 `isEligibleForNightAction` 복제) | 서버와 어긋나면 오지 않을 턴을 안내 | 연출 전용이라 판정에 영향 없음. roster 생사는 이미 공개 정보이고, `nightActionMinDayIndex`를 이미 같은 이유로 복제 중(`constants/actions/ingameActionPanel.js:58-69`)이라는 기존 관례와 일치. 해당 주석에 근거를 남긴다 |
| 릴 배열이 매 렌더 새 참조라 effect가 계속 재실행 | 타이머 리셋 루프 | 커서 effect의 deps는 `reelKey` 문자열과 `hold`만 쓴다 |
| `nightTurnRoles` 누락 시(구버전 세션) 릴 폴백이 없는 역할까지 재생 | 존재하지 않는 역할 안내 | 정상 경로에서는 항상 내려온다. 폴백은 "덜 감추기보다 더 재생"이 안전하다는 판단이며 누출을 만들지 않는다 |
| `e2e/**`(수정 금지)에 밤 안내를 canonical 턴 기준으로 검증하는 시나리오가 있을 수 있음 | e2e 시나리오 실패 가능 | 이번 검증 범위는 backend·frontend 단위 테스트다. e2e는 수정하지 않으며, 영향이 있다면 별도 슬라이스에서 다룬다(이 계획으로는 손대지 않는다) |

## 6. 명시적으로 하지 않는 것

- `getEligibleNightActorUuids`의 생존 필터, `prepareNightResolution`의 제출 대기 조건, `checkNightTurnGate`, `computeCurrentNightTurnRole`, 사망 처리·승리 판정: 전부 무변경.
- `night_turn_changed` payload·방송 조건: 무변경(기존 4키 검증 테스트가 그대로 통과한다).
- 서버가 밤 종료를 연출 시간만큼 미루는 "턴 클럭": 판정 타이밍을 바꾸므로 범위 밖.
- 죽은 보유자 본인 창의 행동 패널: `useInGameActionPanel`을 건드리지 않으므로 기존 관전 동작 그대로.

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | getSessionNightTurnRoles 추가·export, game_started state에 nightTurnRoles |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | 연출 목록의 생사 무관성·판정 커서와의 분리 검증 |
| CREATE | frontend/src/domains/game/ingame/utils/selectInGameNightTurnReel.js |  | 그 밤의 연출 역할 릴 파생(생사 무관) |
| CREATE | frontend/src/domains/game/ingame/utils/__tests__/selectInGameNightTurnReel.test.js |  | 릴 파생 규칙 검증 |
| MODIFY | frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js |  | buildInGameNightTurnReel 추가 |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameNightTurnAnnouncement.js |  | 릴 커서·전진 타이머·statusRole 노출 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameNightTurnAnnouncement.test.js |  | 죽은 역할 턴 재생·리듬·하이드레이션 검증 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.nightTurn.test.js |  | 진입 연출 이후 릴 시작 순서 검증 |
| MODIFY | frontend/src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js |  | NIGHT 문구를 연출 역할 override로 받기 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/selectInGameTimebarStatusMessage.test.js |  | override 경로·하위호환 검증 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/selectInGameTimebarStatusMessage.store.test.js |  | store 기반 문구 파생 갱신 |
| MODIFY | frontend/src/domains/game/ingame/pages/InGamePage.jsx |  | 상태바에 nightTurn.statusRole 배선 |
| MODIFY | frontend/src/domains/game/ingame/store/applySessionSnapshot.js |  | 재접속 시 nightTurnRoles 보존 |
| MODIFY | frontend/src/domains/game/ingame/store/__tests__/applySessionSnapshot.test.js |  | nightTurnRoles 보존 검증 |
| MODIFY | frontend/src/domains/game/ingame/utils/selectInGameNightTurnRole.js |  | 판정 전용임을 주석으로 명시(동작 무변경) |
| MODIFY | frontend/src/domains/game/ingame/utils/reduceInGameNightTurnAnnouncement.js |  | 입력 role이 연출 커서임을 주석으로 명시(로직 무변경) |
| REFERENCE | backend/socket/gameSession.js |  | 판정·방송 경로 무변경 확인 |
| REFERENCE | backend/socket/__tests__/nightTurnProgression.test.js |  | 무수정 PASS로 판정 회귀 없음 증명 |
| REFERENCE | backend/game-core/roleComposition.js |  | 역할 구성 budget 기준 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameOverlayStack.js |  | hold 우선순위 무변경 확인 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js |  | 행동 패널 턴 게이트 무변경 확인 |
| REFERENCE | frontend/src/domains/game/ingame/utils/buildInGameNightTurnAnnouncementIdentity.js |  | identity 조립 규칙 재사용 |
| REFERENCE | frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js |  | 안내 가능 역할 판정 재사용 |
