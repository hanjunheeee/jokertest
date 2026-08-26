# E2E 시나리오 갱신 — 마녀사냥꾼 새 규칙 반영 (e2e) 구현 계획

## 0. 확인한 현재 상태 (실제 코드를 읽고 확인한 사실만)

### 0.1 canonical 규칙 (backend — 수정 금지)

- `backend/game-core/gameSession.js:925 isEligibleForNightAction` — `role === 'WITCH_HUNTER'`면 `hasAnyDeadPlayer(session)`(`:903`)를 그대로 반환한다. **시신이 없는 밤엔 자격 자체가 없다.**
- `:1085 getLivingNightTurnActorUuids` → 자격 없으면 빈 배열 → `:1102 computeCurrentNightTurnRole`이 zero-actor로 건너뜀 → `night_turn_changed`에 `WITCH_HUNTER`가 등장하지 않는다.
- `:1200 prepareNightResolution`은 `getEligibleNightActorUuids`만 훑는다 → **시신 없는 밤엔 WH 제출을 기다리지 않고 판정된다.** `backend/socket/gameSession.js:355-367` — 마지막 역할이 제출하면 `computeCurrentNightTurnRole`이 `null`이 되어 서버가 곧바로 자동 판정한다.
- `:1066` — WH가 살아있는 대상을 지목하면 `INVALID_TARGET`. 대상은 시신뿐이며, **같은 시신을 반복 지목하는 것은 막지 않는다**(중복 금지 규칙 없음).
- `:1406/:1411 submitDayVote` — 사망자는 투표 불가(`ACTOR_NOT_ALIVE`), 사망자를 지목해도 불가(`TARGET_NOT_ALIVE`). `:1521 prepareDayVoteResolution`은 **생존자 전원**의 제출만 기다린다.
- `:1682 getEligibleTribunalVoterUuids` — 생존한 비-피고인만 재판 투표자다.
- `:227 evaluateWinCondition` — 1일차 사망 후 alive J=1 / 비J=3 → 종료 아님. JOKER 처형 후 J=0 → `CITIZEN` 승리.

### 0.2 frontend가 실제로 그리는 화면 (직전 slice 반영 후 — 수정 금지)

- `constants/actions/ingameActionPanel.js:64` — `NIGHT_ACTION_MIN_DAY_INDEX.WITCH_HUNTER = 0`. 따라서 `getInGameNightActionType("WITCH_HUNTER", 1)`은 이제 **`"CONFIRM"`(non-null)** 이다.
- `utils/buildNightActionTargets.js:45` — `selectable: !isAlly && (deadTargetsOnly ? !alive : alive)`. **WH 목록에서 생존자는 사라지지 않고 `selectable:false`로 잠긴다.** `InGameTargetPicker.jsx:62`가 그 값으로 `disabled`를 만든다. 반대로 GUARD 등 다른 역할에게는 **사망자가 잠긴다.**
- `components/actions/InGameActionPanel.jsx:403` — `nightActionType === null`일 때만 `"이 밤에는 행동할 수 없습니다."`가 뜬다. WH는 이제 그 분기에 절대 들어가지 않으므로 **"확인 확정"·"건너뛰기" 버튼은 시신이 없는 밤에도 렌더된다(단, `nightActionControlsEnabled:false`라 항상 disabled).**
- `constants/nightTurn/ingameNightTurnAnnouncement.js:26` — `"마녀사냥꾼의 시간입니다"`. 이 안내는 canonical `nightTurnRole` 하나로 결정되는 **공개 방송**이라 5창 모두에 같은 문구가 뜬다.
- `utils/reduceInGameNightPrivateResult.js:49` — CONFIRM 문구는 `` `${nickname} 님의 역할은 ${display.name}입니다` ``이고 `display.name`은 `ingameRoleRevealData.js:11`의 **CITIZEN → `"시민"`** 이다.
- `result/utils/buildGameResultViewModel.js:11` — 결과 **페이지**의 직업 표시명만 `CITIZEN → "귀족"`이다.
- `result/page/GameResultPage.jsx:49` `label="로비로"` → `useGameResultLobbyExit` → `createSessionEndFinalizer.js:14` `navigate("/multiplay")`. **로비 도착 경로는 `/lobby`가 아니라 `/multiplay`다.**

### 0.3 현재 e2e가 새 규칙에서 깨지는 지점

| 위치 | 깨지는 이유 |
| --- | --- |
| `lib/scenarioPlan.js:101 witchHunterCanActOn` | `getInGameNightActionType("WITCH_HUNTER", dayIndex)`에 위임 → 이제 항상 `true`. "시신 유무"를 전혀 반영하지 못한다. |
| `lib/scenarioPlan.js:74 WITCH_HUNTER_CONFIRM_POOL` | 생존자를 순환 지목 → 서버가 `INVALID_TARGET`, 프런트에서는 버튼이 disabled라 클릭조차 불가. |
| `lib/scenarioPlan.js:66 GUARD_INVESTIGATION_POOL` | `SEAT.CITIZEN` 포함 → 1일차 사망 후 GUARD에게 그 버튼이 disabled가 되어 클릭 불가. |
| `lib/scenarioPlan.js:303 planDay` | `FINAL_DAY_INDEX`(11) 외 모든 낮을 5인 전원 생존으로 계산 → 2일차부터 사망한 CITIZEN이 기권을 시도해 멈춘다. |
| `tests/tenDayScenario.spec.js:141-142` | `seats[witchHunterPlan.targetSeat]`가 `targetSeat===null`이면 `seats[null]`(undefined). |
| `lib/__tests__/scenarioPlan.test.js:87-90` | `witchHunterCanActOn(0)===false` 등 — 직전 slice plan §4가 "후속 e2e slice에서 고칠 잔여물"로 명시한 실패. |

### 0.4 요구서와 실제 코드가 어긋나는 세 지점 (가정을 명시하고 진행한다)

1. **"…님의 역할은 귀족입니다"** — 밤 CONFIRM 오버레이의 CITIZEN 표시명은 `"시민"`이다(`ingameRoleRevealData.js:11`). `"귀족"`은 결과 **페이지** 어휘(`buildGameResultViewModel.js:11`)이며, 지금 spec의 `RESULT_JOB_LABELS`가 이미 그렇게 쓰고 있다. 이 저장소의 e2e는 **기대 문구를 절대 하드코딩하지 않고 프로덕션 빌더에서 파생한다**는 원칙(`scenarioPlan.js:4-7`)이 있고 frontend는 수정 금지이므로, 검증은 `expectedConfirmLabel(닉네임, "CITIZEN")`이 만든 **`"… 님의 역할은 시민입니다"`** 로 한다. `"귀족"`은 요구서대로 결과 페이지 역할 목록에서 계속 검증된다.
2. **"대상 목록에 사망자만 나타나는지"** — 프로덕션은 생존자를 목록에서 지우지 않고 잠근다(§0.2). 그래서 검증은 **"선택 가능한(enabled) 대상은 시신뿐이고, 생존자는 목록에 있되 전부 disabled"** 로 구현한다. 이것이 새 규칙의 관측 가능한 형태 그대로다.
3. **"턴 안내·행동 패널 미출현"** — WH의 밤 행동 섹션 자체는 렌더된다(§0.2). 관측 가능한 "턴이 오지 않음"은 ① `"마녀사냥꾼의 시간입니다"` 안내가 그 밤 내내 한 번도 뜨지 않고, ② `"확인 확정"`·`"건너뛰기"`가 끝까지 disabled이며, ③ WH가 아무것도 제출하지 않았는데도 밤이 판정되어 DAY로 넘어간다(자격이 있었다면 `ACTIONS_PENDING`으로 영원히 멈춘다)는 세 가지다. 세 가지를 모두 검증한다.

추가로, 요구사항 1의 **soft-assert·단계별 스크린샷·종료 시 실패 요약은 현재 `e2e/**`에 존재하지 않는다**(전 파일 확인: `expect` 하드 단언 + `playwright.config.js:26 screenshot:"only-on-failure"` + `finally` 정리뿐). 요구서가 이를 시나리오의 기본 방식으로 전제하므로, **기존 구조를 바꾸지 않는 최소 형태로 신설해 관측 검증에만 적용**하고 진행 동작(제출·집계·전이)은 지금처럼 즉시 실패시킨다 — 진행이 실패한 뒤의 관측은 의미가 없기 때문이다.

---

## 1. 새 시나리오의 canonical 타임라인

`ROLE_REVEAL(day 0) → DAY 1 → NIGHT 1 → DAY 2 → NIGHT 2 → … → NIGHT 9 → DAY 10`
(`dayIndex`는 NIGHT→DAY 전이에서만 오른다 — `README.md:109-116`, `enterDayPhase`)

| 구간 | 내용 | 생존 |
| --- | --- | --- |
| DAY 1 (부트스트랩) | 전원(5인) 기권 → NIGHT 1 | 5 |
| **NIGHT 1 (치명)** | JOKER→CITIZEN, DOCTOR→GUARD(빗나간 보호), GUARD→순환 조사, **WH 턴 없음** | 5 |
| DAY 2 | 사망 영상 → DAY 진입 → CITIZEN 사망 표시 → 생존 4인 기권 | 4 |
| **NIGHT 2~9 (평범, 8회)** | JOKER→GUARD, DOCTOR→GUARD(보호 성공), GUARD→순환 조사, **WH→시신(CITIZEN) 반복 확인** | 4 |
| DAY 3~9 | 사망 영상 없음 → DAY 진입 → 생존 4인 기권 | 4 |
| **DAY 10 (최종)** | 생존 비-JOKER 3인이 JOKER 지목·JOKER 기권 → TRIBUNAL → 유죄 3표 → 처형 → 시민 승리 | 4 |
| 종료 | 결과 페이지 검증 → **5창 전원(사망자 포함) "로비로" → `/multiplay` 도착** | — |

밤 행동 대상 선정 규칙:

- **JOKER**: NIGHT 1 → `CITIZEN`. NIGHT 2~9 → `GUARD`(생존자, JOKER 진영 아님 → 서버 no-op 경로에 걸리지 않음).
- **DOCTOR**: NIGHT 1 → `GUARD`(암살 대상과 다르므로 보호 실패). NIGHT 2~9 → `GUARD`(암살 대상과 동일 → 보호 성공).
- **GUARD**: 풀을 `[JOKER, DOCTOR, WITCH_HUNTER]`(항상 생존·자기 자신 아님)로 축소하고 `(dayIndex-1) % 3`으로 순환 → 매일 다른 대상이며, JOKER(광대 진영)와 DOCTOR/WH(시민 진영) 두 문구가 모두 나온다. **`CITIZEN`을 풀에서 뺀 이유**: 1일차 이후 그 버튼이 GUARD에게 disabled가 되어 클릭 자체가 불가능하다.
- **WITCH_HUNTER**: NIGHT 1 → 행동 없음(턴 부재 검증). NIGHT 2~9 → 매 밤 같은 시신 `CITIZEN`(요구서의 "같은 시신 반복 조사 허용" 확인).

---

## 2. 파일별 변경 내용

### 2.1 `e2e/lib/scenarioPlan.js` (MODIFY, 파일 단위 — 신규 export 추가)

**상수 재정의**
```js
export const FIRST_DAY_INDEX = 1              // 부트스트랩 낮(그대로)
export const LETHAL_NIGHT_DAY_INDEX = 1       // 10 → 1
export const NORMAL_NIGHT_DAY_INDEXES = Object.freeze([2,3,4,5,6,7,8,9]) // 신설
export const NORMAL_NIGHT_COUNT = NORMAL_NIGHT_DAY_INDEXES.length       // 9 → 8
export const FINAL_DAY_INDEX = 10             // 11 → 10
export const VICTIM_SEAT = SEAT.CITIZEN       // 신설 — 시신 좌석의 단일 출처
export const ASSASSINATION_TARGET_SEAT = SEAT.GUARD // 신설 — 평범한 밤의 암살/보호 대상
```
`NORMAL_NIGHT_DAY_INDEXES`를 배열로 노출하는 이유: 새 시나리오는 "1부터 N까지"가 아니라 "치명 밤 1 + 평범한 밤 2~9"라 `for(1..N)` 루프로는 표현할 수 없다.

**풀 교체**
- `GUARD_INVESTIGATION_POOL` → `[SEAT.JOKER, SEAT.DOCTOR, SEAT.WITCH_HUNTER]` (CITIZEN 제거). `guardTargetSeat(dayIndex)`는 `(dayIndex-1) % 3`.
- `WITCH_HUNTER_CONFIRM_POOL`·`witchHunterTargetSeat` **삭제** — 대상은 언제나 그 밤의 시신 집합이며, 이 시나리오에서는 `VICTIM_SEAT` 하나다.

**신규 순수 함수 (파일 단위 MODIFY 사유)**
```js
/** 그 밤이 시작될 때 이미 시신인 좌석 목록. 사망은 밤의 판정(commitNightResolution)에서
 *  확정되므로 치명 밤 당일에는 아직 시신이 없다 — backend hasAnyDeadPlayer의 "그 밤 시작
 *  시점" 의미와 정확히 같다. */
export function deadSeatsAtNight(dayIndex)   // dayIndex > LETHAL_NIGHT_DAY_INDEX ? [VICTIM_SEAT] : []

/** 그 낮에 이미 시신인 좌석 목록. 치명 밤 1의 결과는 DAY 2 진입과 함께 보인다. */
export function deadSeatsAtDay(dayIndex)     // dayIndex > LETHAL_NIGHT_DAY_INDEX ? [VICTIM_SEAT] : []

/** 그 낮의 생존 좌석 index 배열 — 기권·투표 인원 계산의 단일 출처(요구 2). */
export function aliveSeatsAtDay(dayIndex)

/** 역할 턴 안내 문구를 프로덕션 사전에서 파생한다(없으면 throw). WH 턴 "부재" 검증이
 *  대조할 문자열도 하드코딩하지 않는다. */
export function expectedNightTurnMessage(role, dayIndex)  // getInGameNightTurnAnnouncement 위임
```
`expectedNightTurnMessage`를 위해 `constants/nightTurn/ingameNightTurnAnnouncement.js`의 `getInGameNightTurnAnnouncement`를 import에 추가한다(React·소켓 의존이 없는 순수 모듈이라 기존 import 정책을 지킨다).

**`witchHunterCanActOn(dayIndex)` (MODIFY, symbol 지정)**
프런트 위임을 걷어내고 시나리오의 시신 타임라인으로 판정한다.
```js
export function witchHunterCanActOn(dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return false
  return deadSeatsAtNight(dayIndex).length > 0
}
```
JSDoc에 위임을 뗀 이유를 적는다: 프런트는 이제 "시신 유무"를 판단 주체로 두지 않기로 결정했고(직전 slice 결정 B), 판정의 유일한 권위자는 backend `isEligibleForNightAction`이다. e2e는 자기 시나리오가 언제 시신을 만드는지 알고 있으므로 그 사실로 기대값을 만든다.

**`planNight(dayIndex)` (MODIFY, symbol 지정)**
- `lethal = dayIndex === LETHAL_NIGHT_DAY_INDEX`
- JOKER: `lethal ? VICTIM_SEAT : ASSASSINATION_TARGET_SEAT`
- DOCTOR: `lethal ? ASSASSINATION_TARGET_SEAT : ASSASSINATION_TARGET_SEAT` — 치명 밤에는 암살 대상(CITIZEN)과 다르고, 평범한 밤에는 같다. 두 값을 각각 명시해 "왜 같은/다른 좌석인가"를 코드에서 읽히게 한다.
- GUARD: 항상 `SUBMIT`, `guardTargetSeat(dayIndex)`
- WITCH_HUNTER: `witchHunterCanActOn(dayIndex) ? SUBMIT(VICTIM_SEAT) : NONE`
- CITIZEN: 항상 `NONE`
- **좌석 항목에 `turnExpected` 신설**: 그 밤에 canonical 턴이 오는가. CITIZEN은 항상 `false`(밤 행동이 없는 역할), WH는 `witchHunterCanActOn(dayIndex)`, 나머지는 `true`. `action:"NONE"` 하나로는 "역할에 밤 행동이 없다"와 "이 밤엔 턴이 오지 않는다"를 구분할 수 없어 spec이 어떤 검증을 걸어야 할지 정할 수 없다.
- 반환값에 `deadSeats: deadSeatsAtNight(dayIndex)` 추가 — spec이 WH 대상 목록(선택 가능/잠김)을 파생하는 근거.
- `expectedDeathSeat`은 `lethal ? VICTIM_SEAT : null` 그대로.
- 기존의 `lethal → GUARD/WH SKIP` 분기는 **삭제**한다. 새 치명 밤은 1일차이고 그 밤에도 GUARD는 정상 조사해야 하며(요구서 "낮: 생존 전원 기권"만 제약), WH는 애초에 턴이 없다.

**`planDay(dayIndex)` (MODIFY, symbol 지정)**
- `deadSeats = deadSeatsAtDay(dayIndex)` (기존의 "최종 낮에만 사망" 하드코딩 제거)
- 최종 낮이 아니면 생존 좌석 전원 `"ABSTAIN"`, 사망 좌석은 `{alive:false, vote:null}`
- 최종 낮은 생존 비-JOKER가 `SEAT.JOKER`, JOKER 본인은 `"ABSTAIN"`
- 반환값에 `aliveSeatCount`, `deadSeats` 추가 — 요구 2("생존자 기준 계산")를 spec과 단위 테스트가 숫자로 고정할 수 있게 한다.

**`expectedConfirmLabel` / `expectedInvestigateLabel` / `expectedKillRevealMessage` / `expectedRoleRevealTexts`**: 시그니처·본문 변경 없음. `expectedConfirmLabel`의 JSDoc에 §0.4-①(밤 오버레이는 `"시민"`, 결과 페이지가 `"귀족"`)을 한 줄로 명시한다.

### 2.2 `e2e/lib/failureLog.js` (CREATE — 순수)

soft-assert의 순수 축. playwright에 의존하지 않아 `node --test`로 그대로 검증된다.

```js
/** 실패를 모아 두는 수집기. 던지지 않고 기록만 하며, 판단은 호출부가 마지막에 한 번 한다. */
export function createFailureLog()
//   → { record({ step, seatLabel, message }), entries(), hasFailures(), summary() }
/** 수집한 실패를 "N건 — [step] seatLabel: message" 형태의 여러 줄 문자열로 만든다(순수). */
export function formatFailureSummary(entries)
```
- `entries()`는 복사본을 돌려준다(호출부가 배열을 뒤에서 오염시키지 못하게).
- `record`는 `Error`든 문자열이든 받아 `message`만 남긴다(스택은 콘솔·trace가 이미 갖고 있다).
- 실패가 없으면 `summary()`는 빈 문자열.

### 2.3 `e2e/lib/actors.js` (MODIFY, 파일 단위 — 신규 export 추가)

기존 함수는 시그니처·동작을 유지한다. 아래만 추가·보강한다.

**신규 ① `captureStep(seat, label)`**
`test.info().outputPath()` 아래에 `${label}__${seat.label}.png`로 스크린샷 한 장. 파일명에 쓸 수 없는 문자(`·`, `/`, 공백 등)는 `-`로 정규화한다. `E2E_STEP_SHOTS=0`이면 no-op(런타임이 문제될 때 사람이 끌 수 있는 탈출구).

**신규 ② `softly(failureLog, step, seat, fn)`**
`await fn()`을 try/catch로 감싸 실패하면 `failureLog.record` + `captureStep(seat, \`FAIL-${step}\`)` 후 `false`를 돌려준다. 성공이면 `true`. **관측 검증 전용**이며 제출·집계·전이에는 쓰지 않는다.

**신규 ③ `assertNightTurnAbsent(seat, { announcementMessage, actionLabel })`**
- `seat.page.getByText(announcementMessage, { exact: true })` → `toHaveCount(0)`
- 컨트롤 패널 안의 `` `${actionLabel} 확정` `` 과 `"건너뛰기"` → `toBeDisabled()`
요구 3의 검증 본체다. 그 밤에 canonical 턴이 왔다면 두 버튼 중 하나는 반드시 활성이 되고 안내 문구가 뜬다.

**신규 ④ `assertNightActionTargets(seat, { selectableUuids, lockedUuids })`**
- `selectableUuids` 각각 → `locator(selectors.nightTarget(uuid))`가 `toBeEnabled()`
- `lockedUuids` 각각 → 존재하되(`toHaveCount(1)`) `toBeDisabled()`
"목록에 사망자만 (선택 가능하게) 나타나는지"의 실제 형태(§0.4-②). picker 전체가 `nightActionControlsEnabled`로 잠기므로 **반드시 그 좌석의 턴일 때 호출한다** — 밤 2~9의 WH는 마지막 제출자라 GUARD 제출 직후가 그 시점이다.

**신규 ⑤ `returnToLobby(seat)`**
`getByRole("button", { name: "로비로", exact: true })` 클릭 → `waitForURL("**/multiplay")` → `assertNoDialogs`. **도착지가 `/multiplay`인 근거**는 `createSessionEndFinalizer.js:14`이며 JSDoc에 적는다.

**보강 ⑥ `assertNightActionPanel`**
`actionLabel === null`일 때 기대하던 `"이 밤에는 행동할 수 없습니다."`는 이제 WH에게 나타나지 않는다(§0.2). 그 분기는 **CITIZEN 전용**이라는 사실을 JSDoc에 명시하고, WH의 턴 부재는 ③으로 검증한다고 적는다. 코드 자체는 그대로 둔다(CITIZEN 경로는 여전히 유효하다).

### 2.4 `e2e/tests/tenDayScenario.spec.js` (MODIFY, 파일 단위)

전체 흐름을 §1 타임라인으로 재구성한다. 뼈대(5창 open → 로그인 → 방 → 시작 → 역할 공개 → 부트스트랩 DAY 1 → 좌석↔uuid 표 → … → `finally`에서 `closeSeat`)와 `test.step` 분해는 그대로 유지한다.

1. **테스트 상단**에서 `const failureLog = createFailureLog()`를 만들고, 모든 관측 검증을 `softly(failureLog, …)`로 감싼다. 진행 동작(`submitNightAction`/`dayVote`/`resolveDayVote`/`tribunalVoteGuilty`/`resolveTribunal`)은 지금처럼 하드 실패.
2. 각 `test.step` 끝에서 `captureStep(seat, 단계이름)`을 5창에 대해 호출한다(단계별 스크린샷).
3. **부트스트랩 DAY 1**: `planDay(FIRST_DAY_INDEX)`의 생존 좌석(5인) 전원 기권 → `resolveDayVote(seats[0], "NIGHT")`. 기존과 동일하되 `if (!seatPlan.alive) continue` 가드를 넣어 이후 낮과 같은 코드 경로로 만든다.
4. **NIGHT 1 (치명)**:
   - 5창 `settleOverlays({expectPhase:"NIGHT"})` + `waitForPhase("NIGHT", 1)`
   - `assertNightActionPanel(seats[GUARD], "조사")`
   - `assertNightTurnAbsent(seats[WITCH_HUNTER], { announcementMessage: expectedNightTurnMessage("WITCH_HUNTER", 1), actionLabel: "확인" })` ← 밤 진입 직후
   - JOKER → DOCTOR 제출 후 **한 번 더** `assertNightTurnAbsent` (GUARD 턴이 진행 중이고 WH가 다음 차례일 "수도 있는" 시점). GUARD 제출 직후는 서버 자동 판정과 경쟁하므로 그 뒤에는 두지 않는다.
   - GUARD 제출 → 자동 판정
   - `turnExpected === false`인 좌석에는 `submitNightAction`을 애초에 호출하지 않는다. **WH가 아무것도 제출하지 않았는데 밤이 판정된다는 사실 자체**가 요구 3의 세 번째 증거다.
5. **NIGHT 1 결과 / DAY 2 진입**: `settleOverlays({ expectKillReveal: expectedKillRevealMessage(victim), expectPrivateResult: GUARD만 expectedInvestigateLabel(...), expectPhase:"DAY" })` → `waitForPhase("DAY", 2)` → 5창 모두에서 `deadPlayerCard(victim)` 1개 → `assertNoDialogs`.
   `settleOverlays`가 GUARD 창에서 **사망 연출과 개인 결과를 둘 다** 기대하는 첫 경로인데, 이미 우선순위 루프(사망 연출 → 개인 결과 → 진입 연출)가 그 조합을 처리하도록 설계돼 있다(`actors.js:293-335`).
6. **NIGHT 2~9 루프** (`for (const night of NORMAL_NIGHT_DAY_INDEXES)`):
   - 5창 NIGHT 진입 + `waitForPhase("NIGHT", night)`
   - `assertNightActionPanel(seats[GUARD], "조사")`, `assertNightActionPanel(seats[WITCH_HUNTER], "확인")`
   - JOKER → DOCTOR → GUARD 제출
   - **WH 제출 직전** `assertNightActionTargets(seats[WITCH_HUNTER], { selectableUuids: [시신 uuid], lockedUuids: 생존 좌석 uuid들 })` — 요구서의 "대상 목록에 사망자만"
   - WH 제출(`VICTIM_SEAT`) → 자동 판정
   - 결과: **사망 연출 없음**(`expectKillReveal` 미지정 → 뜨면 즉시 실패), GUARD는 `expectedInvestigateLabel`, WH는 `expectedConfirmLabel(victimNickname, "CITIZEN")`, 5창 `expectPhase:"DAY"` → `waitForPhase("DAY", night+1)`
   - 사망 좌석(CITIZEN)에서도 `deadPlayerCard`가 계속 1개인지 확인(관전 상태 유지, 요구 4)
   - `DAY night+1`: 생존 4인 기권 → `resolveDayVote(seats[0], "NIGHT")`
   - 요구서의 "3일차 이후에도 매일 통과"는 이 루프가 `night`을 상수로 쓰지 않고 전부 `planNight(night)`에서 파생하므로 구조적으로 보장된다.
7. **DAY 10 (최종)**: `planDay(FINAL_DAY_INDEX)`의 생존 비-JOKER 3인 → JOKER 지목, JOKER 기권, 사망 좌석 skip → `resolveDayVote(seats[0], "TRIBUNAL")` → 5창 `waitForPhase("TRIBUNAL", 10)`.
8. **재판**: 생존 비-피고인 3인 유죄 → `resolveTribunal(seats[SEAT.DOCTOR])`.
9. **결과 페이지**: 기존 `assertGameResult`(승/패 배너 · 5인 전원 역할 목록 · 로비 버튼) 그대로. `RESULT_JOB_LABELS`도 그대로(요구서의 `"귀족"`이 여기서 검증된다).
10. **로비 이탈**: 5창 전원 `returnToLobby(seat)` — 사망한 CITIZEN 좌석 포함(요구 4·"연속 실행 잔존 방지").
11. **`finally` 직전**: `if (failureLog.hasFailures()) throw new Error(failureLog.summary())` — 종료 시 실패 요약. `closeSeat` 정리는 `finally`에 그대로 남아 이 throw와 무관하게 실행된다.

### 2.5 `e2e/lib/__tests__/scenarioPlan.test.js` (MODIFY, 파일 단위)

기존 테스트의 의도를 유지하되 새 타임라인으로 갱신·추가한다.

| 유지 | 좌석표/DEBUG_FIXED_ROLES, 진영 파생, `ROOM_SETUP_PLAN` 3건, 결과 문구 빌더 throw, 사망 연출 문구, 역할 공개 문구 |
| --- | --- |

갱신·신설:
- 상수 고정: `LETHAL_NIGHT_DAY_INDEX===1`, `NORMAL_NIGHT_DAY_INDEXES` deep-equal `[2..9]`, `NORMAL_NIGHT_COUNT===8`, `FINAL_DAY_INDEX===10`.
- `witchHunterCanActOn`: `0`·`1` → `false`, `2`~`9` → `true`(요구 3의 근거를 여기서 못 박는다).
- 치명 밤: `planNight(1)` — `lethal:true`, `expectedDeathSeat===SEAT.CITIZEN`, JOKER→CITIZEN, DOCTOR→GUARD(**서로 다른 좌석**), GUARD `action:"SUBMIT"`, WH `action:"NONE"`·`turnExpected:false`·`actionLabel:null`, `deadSeats` 빈 배열.
- 평범한 밤: 2~9 전부에서 `lethal:false`, `expectedDeathSeat:null`, JOKER와 DOCTOR의 `targetSeat`가 **같고**, WH `targetSeat===SEAT.CITIZEN`·`turnExpected:true`·`actionLabel==="확인"`, `deadSeats` deep-equal `[SEAT.CITIZEN]`.
- GUARD 순환: 어떤 밤에도 자기 자신·그 밤의 시신을 지목하지 않고, 어제와 다르며, 3밤 주기로 풀 전체를 훑는다.
- WH 대상 불변: 2~9 전 밤에서 대상이 동일(같은 시신 반복 조사 허용을 계획 차원에서 고정).
- `planDay`: 낮 1 → 생존 5·전원 기권, 낮 2~9 → `aliveSeatCount===4`·CITIZEN `alive:false`·`vote:null`·나머지 기권, 낮 10 → `TRIBUNAL`·`expectedTribunalSeat===SEAT.JOKER`·JOKER 기권·비-JOKER 3인이 JOKER 지목·CITIZEN 사망.
- 자기 자신 투표 금지 불변식은 낮 1~10 전체로 확장.
- 문구: `expectedConfirmLabel("테스터5","CITIZEN") === "테스터5 님의 역할은 시민입니다"`(§0.4-① 주석 포함), `expectedInvestigateLabel` 진영 3종 유지, `expectedNightTurnMessage("WITCH_HUNTER", 1) === "마녀사냥꾼의 시간입니다"`·알 수 없는 역할이면 throw.
- `planNight(0)`/`planNight(1.5)` throw 유지.

### 2.6 `e2e/lib/__tests__/failureLog.test.js` (CREATE)

`createFailureLog`가 던지지 않고 모으는 것, `entries()`가 복사본인 것, `Error`/문자열 양쪽을 받는 것, `hasFailures()`가 0건에서 `false`인 것, `formatFailureSummary`가 건수와 step·seat·message를 한 줄씩 포함하는 것. `package.json:10`의 `test:helpers` glob(`lib/__tests__/*.test.js`)이 자동으로 잡으므로 스크립트 변경은 없다.

### 2.7 `e2e/playwright.config.js` (MODIFY, 파일 단위)

- `timeout: 15 * 60_000` → `20 * 60_000`. 단계별 스크린샷(5창 × 약 35단계 ≈ 175장)이 수십 초를 더 쓰고, 밤 9회 + 낮 10회로 구간 수도 늘어난다. 주석에 이유를 적는다.
- `use.screenshot: "only-on-failure"`는 **그대로 둔다** — 명시적 단계 스크린샷과 역할이 다르다(전자는 실패 순간, 후자는 진행 기록).

### 2.8 `e2e/README.md` (MODIFY)

- 제목/개요의 "1~9일차 반복 → 10일차 사망"을 §1 타임라인 표로 교체.
- **§"마녀사냥꾼의 day0 스킵 분기는 현재 배포 흐름에서 밟히지 않는다"(:118-127) 전면 교체** → "마녀사냥꾼은 시신이 있는 밤에만 턴을 받는다": backend `isEligibleForNightAction`/`hasAnyDeadPlayer` 근거, 1일차 밤에 턴이 오지 않고 `prepareNightResolution`이 WH를 기다리지 않는다는 사실, 프런트는 시신 유무를 판단하지 않으므로 `"이 밤에는 행동할 수 없습니다."`가 WH에게 나타나지 않는다는 사실, 그래서 e2e가 `witchHunterCanActOn`을 자기 시나리오의 시신 타임라인으로 판정한다는 점.
- 새 §"마녀사냥꾼 대상 목록에는 생존자도 보인다(잠겨 있을 뿐)" — `buildNightActionTargets.js:45` 근거와 e2e의 검증 형태.
- 새 §"밤 CONFIRM 문구의 CITIZEN은 '시민', 결과 페이지는 '귀족'" — §0.4-①.
- 새 §"결과 화면의 '로비로'는 `/multiplay`로 간다" — `createSessionEndFinalizer.js:14` 근거.
- 새 §"soft-assert·단계 스크린샷·실패 요약" — 관측 검증만 soft이고 진행 동작은 즉시 실패라는 경계, `E2E_STEP_SHOTS=0` 탈출구.
- 파일 구성 표에 `lib/failureLog.js` 한 줄 추가. 예상 소요·타임아웃 수치 갱신.

---

## 3. 검증 절차

1. `npm run test:e2e-helpers` (= `node --test "e2e/lib/__tests__/*.test.js"`) — `env` · `scenarioPlan` · `selectors` · `failureLog` 전부 PASS. 요구서 검증 ①.
2. `npm --prefix frontend test` — 전체 PASS. **frontend는 한 줄도 바꾸지 않으므로 무변경 증명이다.** 요구서 검증 ②.
3. `npm --prefix frontend run build` — PASS(참고 실행, 무변경 확인).
4. `npm run test:game-core` — PASS(참고 실행, backend 무변경 확인).
5. `npx --prefix e2e playwright test --list` — spec이 문법·import 오류 없이 로드되는지(브라우저 없이 확인 가능한 마지막 관문).
6. 실제 시나리오 재생(`npm run test:e2e`)은 backend(`DEBUG_FIXED_ROLES`) + frontend dev 서버 + `e2e/.env` 계정 5개가 갖춰진 환경에서만 가능하다. 이 단계에서 그 환경이 없다면 **1~5까지 수행하고 6은 미실행으로 명시 보고**한다 — 실행하지 않은 것을 통과했다고 적지 않는다.

---

## 4. 위험과 대응

**(가장 큰 위험) 요구서 문구 세 건과 프로덕션의 불일치.** §0.4에 근거와 함께 정리했고, 세 건 모두 "프로덕션 동작이 옳고 요구서 문장이 그 동작의 다른 표현이거나 다른 화면의 어휘"라고 판단해 프로덕션 기준으로 구현한다. frontend 수정으로 요구서 문구를 맞추는 선택지는 이번 slice의 범위 밖(`e2e/**`만)이라 취하지 않는다.

**WH 턴 부재 검증의 경쟁 조건.** GUARD가 제출하는 순간 서버가 자동 판정하고 DAY로 넘어간다. 그래서 `assertNightTurnAbsent`는 **밤 진입 직후**와 **DOCTOR 제출 직후**(GUARD가 아직 제출 전) 두 시점에만 둔다. GUARD 제출 이후에는 두지 않는다.

**WH 대상 목록 검증의 시점.** picker 전체가 `nightActionControlsEnabled`로 잠기므로 `toBeEnabled()`는 WH의 턴이 열린 뒤에만 참이다. 밤 2~9에서 WH는 마지막 제출자라 GUARD 제출 완료 직후가 유일하게 옳은 시점이며, 그 시점에는 자동 판정이 아직 일어나지 않는다(WH 제출이 남아 있다). 순서를 바꾸면 이 단언이 깨진다.

**GUARD 풀 축소의 부작용.** 순환 주기가 4 → 3으로 줄어 밤 9회 동안 각 대상이 3회씩 나온다. "어제와 다른 대상"·"자기 자신 아님"·"시신 아님"은 모두 유지되고 진영 문구 두 종류가 모두 나온다 — 단위 테스트로 고정한다.

**사망 좌석의 관전 안정성.** DAY마다 5창 전부에 `settleOverlays`/`waitForPhase`를 거는 구조는 그대로 두되, 사망 좌석은 투표·밤 행동 루프에서 `alive`/`turnExpected`로 제외한다. 진입 연출·사망 연출 훅에는 생존 게이트가 없음을 확인했고(`useInGamePhaseEntrance`는 `alive`를 읽지 않는다), 사망자가 결과 화면까지 따라가는 경로는 기존 시나리오가 이미 1회 검증하던 경로다 — 새 시나리오는 그 구간이 1일에서 9일로 길어질 뿐이다. 만약 관전 창이 어느 밤에서 멈춘다면 그것은 시나리오 버그가 아니라 프로덕션 회귀이며, soft-assert가 아니라 하드 타임아웃으로 그 밤에서 즉시 드러난다.

**런타임 증가.** 낮이 10회 + 밤 9회 + 5창 단계 스크린샷. `timeout`을 20분으로 올리고 `E2E_STEP_SHOTS=0` 탈출구를 둔다. 그래도 초과하면 스크린샷 대상을 "그 단계의 주인공 좌석"으로 좁히는 것이 다음 조정 지점이다(README에 명시).

**soft-assert의 오용 위험.** 진행 동작까지 soft로 감싸면 첫 실패 이후 모든 단계가 무의미한 실패를 쏟아내 요약이 쓸모없어진다. `softly`의 JSDoc에 "관측 전용 — 제출·집계·전이에는 절대 쓰지 않는다"를 계약으로 명시하고, spec에서도 두 종류의 호출이 섞이지 않게 배치한다.

**`e2e/.env`·서버 전제.** PLAN·구현 단계에서 실제 재생은 불가능할 수 있다. §3-6의 보고 규칙을 지킨다.

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | e2e/lib/scenarioPlan.js |  | 새 타임라인 상수·GUARD 풀 축소·시신 좌석 파생 함수·턴 안내 문구 파생 신설 |
| MODIFY | e2e/lib/actors.js |  | 단계 스크린샷·softly·턴 부재 단언·대상 목록 단언·로비 이탈 신설 |
| MODIFY | e2e/tests/tenDayScenario.spec.js |  | 1일차 치명 밤 → 2~9일차 반복 → 10일차 처형·전원 로비 이탈로 시나리오 재구성 |
| MODIFY | e2e/lib/__tests__/scenarioPlan.test.js |  | 새 밤낮 계획·생존자 기준 계산·WH 시신 규칙 단위 테스트 갱신 |
| CREATE | e2e/lib/failureLog.js |  | soft-assert 실패 수집기와 종료 요약 포매터(순수) |
| CREATE | e2e/lib/__tests__/failureLog.test.js |  | 실패 수집·요약 포맷 단위 테스트 |
| MODIFY | e2e/playwright.config.js |  | 단계 스크린샷·구간 증가에 맞춘 테스트 타임아웃 상향 |
| MODIFY | e2e/README.md |  | 마녀사냥꾼 새 규칙·문구 출처·로비 경로·soft-assert 운영 문서 갱신 |
| REFERENCE | e2e/lib/selectors.js |  | 대상 버튼·사망 카드·컨트롤 패널 셀렉터 재사용 확인 |
| REFERENCE | e2e/lib/env.js |  | 좌석 계정 해석 계약 확인(변경 없음) |
| REFERENCE | backend/game-core/gameSession.js |  | 밤 자격·시신 대상·생존 투표자·승리 판정의 canonical 규칙 |
| REFERENCE | backend/socket/gameSession.js |  | 마지막 역할 제출 시 자동 밤 판정 경로 확인 |
| REFERENCE | frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js |  | 밤 행동 문구·WH 하한 0·사망자 전용 역할 규칙 확인 |
| REFERENCE | frontend/src/domains/game/ingame/utils/buildNightActionTargets.js |  | 생존자가 목록에 남고 selectable만 잠기는 계약 확인 |
| REFERENCE | frontend/src/domains/game/ingame/components/actions/InGameTargetPicker.jsx |  | 대상 버튼 disabled 조건과 uuid data 훅 확인 |
| REFERENCE | frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js |  | 턴 안내 문구 파생 원천 |
| REFERENCE | frontend/src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js |  | 조사·확인 결과 문구 파생 원천 |
| REFERENCE | frontend/src/domains/game/ingame/constants/roleReveal/ingameRoleRevealData.js |  | CITIZEN 표시명이 "시민"임을 확인 |
| REFERENCE | frontend/src/domains/game/result/utils/buildGameResultViewModel.js |  | 결과 페이지 직업 표시명("귀족") 확인 |
| REFERENCE | frontend/src/domains/game/ingame/utils/createSessionEndFinalizer.js |  | 로비 버튼 도착지가 /multiplay임을 확인 |
