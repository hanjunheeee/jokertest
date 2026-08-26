# E2E 멀티 클라이언트 10일차 시나리오 — 구현 계획

## 0. 이 계획이 서 있는 사실 (실제 코드 확인 결과)

읽은 파일에서 확정한 것들. 스크립트의 모든 분기가 여기에 매달려 있다.

**역할 배정 / 방 설정**
- `resolveDebugFixedRoleAssignment`(`backend/game-core/gameSession.js:365`)는 고정 목록의 역할별 개수가 그 방의 canonical 구성과 **정확히 일치할 때만** 적용되고, 아니면 경고 한 줄 남기고 **랜덤으로 되돌아간다**.
- `getSpecialRoleBudget(5)`는 `{DOCTOR:0, GUARD:0, WITCH_HUNTER:0}`(`backend/game-core/roleComposition.js:43`). 즉 **5인 AUTO 방은 JOKER 1 + CITIZEN 4**가 되고, `DEBUG_FIXED_ROLES=JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN`은 `COMPOSITION_MISMATCH`로 조용히 무시된다.
- 따라서 스크립트는 방을 반드시 **CUSTOM(직접 지정)** 으로 만들어야 한다: 최대 플레이어 5, 역할 구성 "직접 지정", 광대 1 · 의사 1 · 경비대 1 · 마녀사냥꾼 1 → CITIZEN은 서버가 `5-4=1`로 파생(`resolveRoleComposition:228`).
- `computeCanStart`(`backend/socket/matchmaking.js:215`)는 **방장 포함 전원 `isReady===true`** 를 요구한다.

**단계 흐름 (요구서와 다른 지점 — §6 참조)**
- `INITIAL_GAME_PHASE='ROLE_REVEAL'`, `INITIAL_DAY_INDEX=0`. 전원 역할 확인이 끝나면 `enterDayPhase`로 **DAY dayIndex 1**로 진입한다(`gameSession.js:756,822`). 게임의 첫 진행 단계는 밤이 아니라 **낮**이다.
- `dayIndex` 증가는 오직 `enterDayPhase`(NIGHT→DAY)에서만 일어난다. DAY→NIGHT(`commitDayVoteResolution:1481`)와 TRIBUNAL→NIGHT는 dayIndex를 유지한다.
- 실제 순서: `ROLE_REVEAL(0) → DAY(1) → NIGHT(1) → DAY(2) → NIGHT(2) → …`

**밤 진행**
- 턴 순서 `JOKER→DOCTOR→GUARD→WITCH_HUNTER`. 마지막 역할까지 제출이 끝나면 `handleSubmitNightAction`이 **client `resolve_night` 없이 자동으로** 판정한다(`backend/socket/gameSession.js:358`). 밤은 사람이 버튼을 누를 필요가 없다.
- 반면 **낮 집계(`resolve_day_vote`)와 재판 판정(`resolve_tribunal_vote`)은 UI 버튼("낮 집계", "재판 판정")을 눌러야** 진행된다.
- `ROLE_DEFINITIONS.WITCH_HUNTER.nightActionMinDayIndex = 1`, 나머지 행동 역할은 0.
- 개인 결과: GUARD는 `{targetId, team}`, WITCH_HUNTER는 `{targetId, role}`. SKIP(null 제출)이면 결과 자체가 생기지 않는다(`gameSession.js:896,905`).

**승패**
- `evaluateWinCondition`(`gameSession.js:221`): 생존 JOKER 0 → CITIZEN 승, 생존 JOKER ≥ 생존 비-JOKER → JOKER 승.
  - 10일차 밤에 CITIZEN이 죽어도 `1 >= 3`이 아니므로 게임은 계속된다. ✅
  - 다음 낮 재판에서 JOKER 처형 → 생존 JOKER 0 → **CITIZEN 승 + ENDED**. ✅
- `game_ended` 소켓 이벤트는 **정상 종료가 아니라 세션 teardown(이탈/disconnect)에서만** 방송된다(`backend/socket/gameSession.js:1315`). 즉 정상 승리 시 `createGameEndedHandler`가 로비로 튕기지 않고, `useInGameResultNavigation`이 `/gameresult`로 replace 이동한다.

**투표 제약**
- `buildDayVoteTargets`/`buildNightActionTargets`는 본인을 목록에서 제거한다(DOCTOR만 자기 대상 허용). `submitDayVote`도 `SELF_TARGET_NOT_ALLOWED`로 거부한다. → **"생존 전원이 JOKER 투표"는 JOKER 본인에게 불가능**하므로, 비-JOKER 3명이 JOKER에 투표하고 JOKER는 기권한다(`tallyDayVoteOutcome`: 유효표 3 단독 최다 → TRIBUNAL).
- 재판 유효 투표자는 `생존 && 피고인 아님` 3명. 전원 유죄 → `3 > 0` → GUILTY → 피고인 사망.

**오버레이 (스크립트가 반드시 처리해야 하는 것)**
- 우선순위(`useInGameOverlayStack`): 역할 공개 → 사망 연출 → 개인 조사 결과 → DAY/NIGHT 진입 연출 → 밤 역할 턴 안내.
- 진입 연출(`data-ingame-phase-entrance`)·사망 연출(`data-ingame-kill-reveal`)·개인 결과(`data-ingame-night-private-result`)는 `interactionBlocked`를 켜서 게임 표면에 `inert`를 건다 → **닫기 전에는 어떤 클릭도 불가능**.
- 밤 역할 턴 안내는 `interactionBlocked`를 켜지 않지만 backdrop이 `fixed inset-0 z-[60]` 전면 버튼이라 **포인터를 가로챈다**. 2.6초 뒤 자동 소멸하되 턴이 바뀔 때마다 다시 뜬다(한 밤에 최대 4회 × 5창).
- 진입 연출은 DAY·NIGHT 전이마다 **창마다 개별로** 확인 버튼을 눌러야 한다. 10밤 + 11낮 ≈ 21회 × 5창.

**셀렉터 가용성 (프런트 수정이 필요한 이유)**
- 이미 있음: 오버레이 3종의 `data-*`, 대부분의 이미지 버튼 `aria-label`, 스테퍼 `"{라벨} 감소/증가"`, 방코드 입력 `"방 코드 N번째 자리"`.
- **없음**: ① 현재 phase/dayIndex를 기계 판독할 수단(배지 텍스트뿐) ② 플레이어 보드의 생존/사망 상태(해골 배지가 `aria-hidden` 이미지) ③ 대상 버튼의 uuid.
  → 10일 루프를 텍스트 배지로 폴링하는 것은 회귀에 너무 약하다. 이 세 곳에만 **표시에 영향 없는 `data-*` 훅**을 추가한다.

---

## 1. 시나리오 확정본

좌석은 **입장 순서**로 결정된다: `S1=JOKER, S2=DOCTOR, S3=GUARD, S4=WITCH_HUNTER, S5=CITIZEN`.

| 단계 | 내용 |
| --- | --- |
| 부트스트랩 | 5계정 로그인 → S1이 CUSTOM 5인 방 생성 → S2~S5가 방코드로 순서대로 입장 → 전원 준비 → S1 게임 시작 |
| 역할 공개 | 창마다 자기 역할 오버레이 문구(`역할명`/`진영`) 검증 후 닫기 |
| DAY 1 | (요구서에 없는 필수 구간) 전원 기권 → 낮 집계 → ABSTAINED → NIGHT 1 |
| NIGHT n (n=1..9) | JOKER→S5 암살 / DOCTOR→S5 보호 / GUARD→순환 조사 / WH→순환 확인. **조사·확인 패널 존재 검증이 제출보다 먼저.** 보호 성공 → 사망 연출 미출현 검증 → GUARD·WH 개인 결과 문구 검증 → DAY n+1 진입 검증 → 전원 기권 → 낮 집계 → NIGHT n+1 전이 검증 |
| NIGHT 10 | JOKER→S5 / DOCTOR→S3(GUARD) / GUARD·WH는 건너뛰기 → S5 사망 → 사망 영상 재생 검증 → DAY 11 진입 + S5 사망 표시 검증 |
| DAY 11 | S2·S3·S4가 S1(JOKER) 투표, S1은 기권 → 낮 집계 → TRIBUNAL 전이 검증 |
| TRIBUNAL | S2·S3·S4 유죄 → 재판 판정 → S1 처형 → **ENDED / CITIZEN 승** |
| 결과 | 5창 모두 `/gameresult` 전이 · 승/패 배너(S1만 패배) · 전원 정체 공개 목록 · "로비로" 버튼 검증 |

**순환 규칙** (`e2e/lib/scenarioPlan.js`가 소유):
- GUARD 조사 풀 = 자기 제외 4명 `[S1,S2,S4,S5]`, night n → `pool[(n-1) % 4]`.
- WH 확인 풀 = 자기 제외 4명 `[S1,S2,S3,S5]`, night n → `pool[(n-1) % 4]`.
- 두 풀의 시작점을 다르게 잡아 같은 밤에 같은 대상을 겹쳐 보지 않게 한다(검증 문구가 구분되도록).
- 10일차에 GUARD/WH를 건너뛰는 이유: 요구서 10일차 항목이 JOKER/DOCTOR만 지정했고, SKIP이면 개인 결과 이벤트 자체가 생기지 않아(`computeGuardInvestigationResult` null) 사망 연출 검증이 다른 오버레이와 경쟁하지 않는다. 그래도 **턴은 정상 전진**한다(`nightTurnProgression.test.js:138`가 보장).

---

## 2. 프런트엔드 변경 (표시 무변경, 훅만 추가)

### 2.1 `frontend/src/domains/game/ingame/constants/e2e/ingameE2eHooks.js` (신규)

data 속성 **이름의 단일 원천**. 프런트 컴포넌트와 e2e 셀렉터가 같은 모듈을 import 하므로 이름이 어긋날 수 없다.

```js
export const INGAME_E2E_ATTRS = Object.freeze({
  phase: "data-ingame-phase",
  dayIndex: "data-ingame-day-index",
  selfRole: "data-ingame-self-role",
  playerStatus: "data-ingame-player-status",
  playerNickname: "data-ingame-player-nickname",
  playerSelf: "data-ingame-player-self",
  targetId: "data-ingame-target-id",
})
export function buildInGameControlPanelE2eAttrs(gameState) { /* phase/dayIndex/self.role → 속성 객체, 없으면 생략 */ }
export function buildInGamePlayerCardE2eAttrs({ nickname, status, isSelf }) { /* … */ }
export function buildInGameTargetE2eAttrs(player) { /* … */ }
```
- 전부 순수 함수. 값이 없으면 그 키를 넣지 않는다(`undefined` 속성이 DOM에 새지 않게).
- `data-ingame-self-role`은 이미 화면에 "역할 JOKER"로 노출되는 값이라 새 정보 누출이 아니다. 다른 참가자의 role은 절대 싣지 않는다 — `buildInGamePlayerCardE2eAttrs`는 nickname/status/self만 받는다.

### 2.2 `InGameActionPanel.jsx` (수정)
- `<aside aria-label="게임 조작">`에 `{...buildInGameControlPanelE2eAttrs(gameState)}` 전개.
- `gameState`가 없는 초기 분기의 `<aside>`에는 붙이지 않는다(그 자체가 "아직 세션 없음"의 신호).
- 그 외 로직·클래스·문구 일절 무변경. 기존 `InGameActionPanel.productionSource.test.js`의 4개 단정(`onClick={submitNightAction}`, `` `${nightActionLabel} 확정` ``, `resolveNight*` 부재)에 영향 없음.

### 2.3 `InGameTargetPicker.jsx` (수정)
- 각 대상 `<button>`에 `{...buildInGameTargetE2eAttrs(player)}` 전개(`data-ingame-target-id`). `disabled`/`aria-pressed`/클래스 계산은 그대로.

### 2.4 `InGamePlayerCard.jsx` (수정)
- 최상위 카드 `<div>`에 `{...buildInGamePlayerCardE2eAttrs({ nickname, status, isSelf })}` 전개.
- 이것이 "10일차 사망자 표시 검증"의 유일한 기계 판독 근거이자, 각 창이 자기 닉네임을 확인하는 수단(`data-ingame-player-self="true"`).

### 2.5 `ingameE2eHooks.test.js` (신규, node:test)
1. 세 빌더의 순수 계약: 정상 입력 → 정확한 키/값, 결측 입력 → 키 자체 없음, role 등 비밀 필드가 player 카드 속성에 절대 안 붙음.
2. **드리프트 방지 소스 검증**(기존 `*.productionSource.test.js` 관례): 세 `.jsx`를 `readFile`로 읽어 `ingameE2eHooks.js`를 import 하고 해당 빌더를 전개하는지 정규식으로 단정. 누가 속성을 손으로 다시 적거나 훅을 떼면 여기서 깨진다.

`.jsx`는 이 저장소의 `node --test`가 파싱할 수 없으므로(로더 없음) 렌더 테스트는 불가능하다 — 소스 검증이 이 저장소가 이미 쓰는 대안이다.

---

## 3. E2E 스크립트 (repo 루트 `e2e/`)

slice worktree가 아니라 **본 repo에서 실행**하는 물건이므로 루트에 독립 패키지로 둔다.

### 3.1 `e2e/package.json`
`{"type":"module", "private":true}`, devDependency `@playwright/test`.
스크립트: `test`(playwright test), `test:helpers`(`node --test lib/__tests__/`), `install:browsers`(`playwright install chromium`).
→ **헬퍼 단위 테스트는 playwright 설치 없이 돈다**. 이게 이 슬라이스 검증의 전제다(§5).

### 3.2 `e2e/playwright.config.js`
- `testDir: "./tests"`, `fullyParallel: false`, `workers: 1`, `retries: 0`.
- `timeout: 15 * 60_000`(21회 진입 연출 × 5창 + 10밤), `expect.timeout: 15_000`.
- `use.baseURL = E2E_BASE_URL ?? "http://localhost:5173"`, `trace: "retain-on-failure"`, `video: "retain-on-failure"`.
- `launchOptions.args: ["--autoplay-policy=no-user-gesture-required"]` — 사망 영상이 muted+playsInline이지만 자동재생 거부 시 `"다시 재생"` 상태로 빠지는 경로를 애초에 막는다.
- `webServer`는 **쓰지 않는다**. 백엔드 env·프런트 dev 서버는 사람이 미리 띄우는 실행 전제다.

### 3.3 `e2e/lib/env.js` (순수 + 얇은 fs 래퍼)
- `parseDotEnv(text)` — `KEY=VALUE`, `#` 주석, 빈 줄, 따옴표 벗기기. 순수 함수.
- `resolveE2eAccounts(envObj)` — `E2E_USER1_EMAIL/PASSWORD/NICKNAME` … `E2E_USER5_*` 5쌍을 좌석 순서 배열로 만들고, 하나라도 비면 **무엇이 빠졌는지 이름을 찍어** throw. 순수 함수.
- `loadE2eEnv()` — `e2e/.env`를 읽어 위 둘을 조립(fs 접촉은 여기 한 줄).

### 3.4 `e2e/lib/scenarioPlan.js` (전부 순수, 이 슬라이스의 핵심 검증 대상)
프런트의 **프로덕션 문구 빌더를 그대로 재사용**해 기대값을 만든다. 문구를 복사하지 않으므로 드리프트가 구조적으로 불가능하다.

```js
import { getInGameRoleRevealDisplay } from "../../frontend/src/domains/game/ingame/constants/roleReveal/ingameRoleRevealData.js"
import { reduceInGameNightPrivateResult } from "../../frontend/src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js"
import { buildInGameKillRevealMessage } from "../../frontend/src/domains/game/ingame/constants/killReveal/ingameKillReveal.js"
import { getInGameNightActionType, getInGameNightActionLabel } from "../../frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js"
```
(`frontend/package.json`이 `"type":"module"`이라 그대로 ESM import 된다. 넷 다 React/소켓 의존이 없는 순수 모듈임을 확인했다.)

공개 API:
- `SEAT_ROLES` = `["JOKER","DOCTOR","GUARD","WITCH_HUNTER","CITIZEN"]`, `DEBUG_FIXED_ROLES_VALUE` = 그 join.
- `ROOM_SETUP_PLAN` — 방 생성 화면에서 눌러야 할 스테퍼 조작 목록. 기본값(`최대 플레이어 10`, `광대 2`, `역할 구성 자동`)에서 목표값(`5 / CUSTOM / 광대1·의사1·경비대1·마녀사냥꾼1`)까지의 **(라벨, 방향, 횟수)** 를 계산한다. 순서가 중요: ① 최대 플레이어 10→5 ② `코드로만 참가` 체크 ③ 역할 구성 자동→직접 지정(이때 `selectMode`가 광대 수 2를 승계한다) ④ 광대 2→1 ⑤ 의사·경비대·마녀사냥꾼 0→1. `getRoleCountRange`의 상·하한을 그대로 반영해 클릭이 헛돌지 않게 한다.
- `NORMAL_NIGHT_COUNT = 9`, `LETHAL_NIGHT_DAY_INDEX = 10`, `FINAL_DAY_INDEX = 11`.
- `witchHunterCanActOn(dayIndex)` — `getInGameNightActionType("WITCH_HUNTER", dayIndex) !== null` 위임.
- `planNight(dayIndex, seats)` → 좌석별 `{ seat, action: "SUBMIT"|"SKIP"|"NONE", targetSeat, expectedPanelLabel }` + `expectedDeathSeat`.
- `planDay(dayIndex, seats)` → 좌석별 `{ seat, vote: "ABSTAIN" | targetSeat }` + `expectedOutcome`(`"ABSTAINED"`/`"TRIBUNAL"`) + `expectedTribunalSeat`.
- `expectedInvestigateLabel(targetNickname, targetRole)` / `expectedConfirmLabel(...)` — `reduceInGameNightPrivateResult`에 합성 payload를 넣어 **프로덕션이 실제로 그릴 문자열**을 얻는다. 조사 결과의 team은 `ROLE_TEAMS`가 아니라 좌석 role에서 파생(`JOKER→"JOKER"`, 나머지→`"CITIZEN"`).
- `expectedKillRevealMessage(nickname)` → `buildInGameKillRevealMessage("JOKER", nickname)`.
- `expectedRoleRevealTexts(role)` → `getInGameRoleRevealDisplay(role)`의 `{name, teamLabel}`.

### 3.5 `e2e/lib/selectors.js` (순수)
`INGAME_E2E_ATTRS`로부터 CSS 셀렉터 문자열을 만드는 함수들.
`controlPanel()`, `controlPanelWithPhase(phase)`, `playerCard(nickname)`, `deadPlayerCard(nickname)`, `selfPlayerCard()`, `nightTarget(uuid)`, `phaseEntrance(phase)`, `killReveal()`, `nightPrivateResult(kind)`.
+ 텍스트 상수(버튼 라벨)는 프런트 상수 모듈에서 import(`INGAME_PHASE_ENTRANCE_CONFIRM_LABEL`, `TRIBUNAL_VOTE_GUILTY_LABEL`, `INGAME_KILL_REVEAL_SKIP_LABEL` 등).

### 3.6 `e2e/lib/actors.js` (Playwright 의존, 단위 테스트 없음)
5창 각각을 감싸는 얇은 page-object.
- `openSeat(browser, account, seatIndex)` — 새 context+page, `/login` → 이메일/비밀번호(`placeholder`) 입력 → `aria-label="로그인"` 클릭 → `/lobby` 대기.
- `createRoom(seat)` — `/game-setup`으로 이동 → `ROOM_SETUP_PLAN` 실행 → `aria-label="게임 만들기"` → `/game-matching` 대기.
- `readRoomCode(hostSeat)` — `aria-label="초대코드 공유"` → 모달의 `방 코드 N번째 자리` 6칸 `inputValue()` 조합 → `방코드 팝업 닫기`.
- `joinByCode(seat, code)` — `/roomInvite` → 6칸 입력 → `aria-label="참여하기"` → `/game-matching` 대기. **입장 순서 보장을 위해 S2→S3→S4→S5를 순차(await) 실행**한다. 여기서 병렬로 돌리면 역할 배정이 뒤섞인다.
- `setReady(seat)` / `startGame(hostSeat)`.
- `settleOverlays(seat, { expectPrivateResult, expectKillReveal })` — 이 스크립트의 심장.
  1. 사망 연출이 떠 있으면: `expectKillReveal`이 아니면 즉시 실패, 맞으면 `<video>` 재생 확인 → 문구 검증 → 자연 종료 대기, 워치독/오류 시 `"건너뛰기"` 클릭.
  2. 개인 결과가 떠 있으면: `expectPrivateResult` 문구와 대조 후 `"확인"`.
  3. 진입 연출이 떠 있으면 문구 확인 후 `"확인"`.
  4. 밤 역할 턴 안내가 떠 있으면 `"확인"`(자동 소멸을 기다리지 않고 명시적으로 닫아 backdrop이 클릭을 삼키지 않게 한다).
  5. 아무것도 안 뜰 때까지 반복. 상한 횟수를 두고 초과 시 실패.
- `waitForPhase(seat, phase, dayIndex)` — `data-ingame-phase`/`data-ingame-day-index` 폴링(오버레이 정리 후).
- `submitNightAction(seat, targetUuid | null)` — 대상 카드 클릭 → `"{라벨} 확정"` / `"건너뛰기"`. 버튼이 enabled 될 때까지 대기(자기 턴이 와야 활성).
- `dayVote(seat, targetUuid | null)`, `resolveDayVote(seat)`, `tribunalVote(seat, "GUILTY")`, `resolveTribunal(seat)`.
- `readSelfNickname(seat)` — `data-ingame-player-self` 카드에서 읽어 `.env`의 닉네임과 대조.
- `readSeatUuids(hostSeat)` — 대상 목록의 `data-ingame-target-id` + 닉네임으로 좌석↔uuid 표를 만든다(호스트 창은 자기 자신이 빠지므로, 두 창의 목록을 합쳐 5명을 채운다).

### 3.7 `e2e/tests/tenDayScenario.spec.js`
위 헬퍼를 `test.describe.serial`로 엮은 **단일 시나리오 테스트**. 각 구간마다 `test.step()`으로 이름을 붙여 실패 지점이 리포트에 바로 드러나게 한다. 스텝은 §1 표 그대로.

### 3.8 `e2e/.env.example` / `e2e/README.md`
- `.env.example`: `E2E_BASE_URL`, `E2E_USER{1..5}_{EMAIL,PASSWORD,NICKNAME}`. 값은 전부 placeholder.
- `README.md`: 실행 전제를 **명령 단위로** 적는다.
  1. `backend/.env`에 `DEBUG_FIXED_ROLES=JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN` (`.env.example:30`의 주석 해제)
  2. `npm run dev` (backend + frontend)
  3. 테스트 계정 5개를 회원가입해 두고 `e2e/.env` 작성
  4. `npm --prefix e2e install && npm --prefix e2e run install:browsers`
  5. `npm --prefix e2e test`
  - **왜 CUSTOM 방이어야 하는가**(5인 AUTO는 고정 배정이 무시된다)를 명시. 이 한 줄이 빠지면 다음 사람이 반드시 밟는 함정이다.
  - §6의 마녀사냥꾼 관측 사실도 여기 남긴다.

---

## 4. 루트 배선

- `package.json`: `"test:e2e-helpers": "node --test e2e/lib/__tests__/"`, `"test:e2e": "npm --prefix e2e test"` 추가. 전자는 의존성 설치 없이 도는 **이 슬라이스의 검증 게이트**다. (프런트처럼 셸 glob에 기대지 않고 디렉터리 경로를 넘긴다 — PowerShell에서 `**` 확장이 안 되기 때문.)
- `.gitignore`: `e2e/test-results/`, `e2e/playwright-report/`, `e2e/blob-report/` 추가. `e2e/.env`는 기존 `**/.env`가, `.env.example`은 기존 `!**/.env.example`이 이미 커버한다.

---

## 5. 검증

이 슬라이스의 검증 범위는 요구서대로 **스크립트 작성 + 헬퍼 단위 테스트 + 기존 테스트/빌드 PASS**까지다. 실제 5창 재생은 merge 후 사람이 한다.

| 명령 | 기대 |
| --- | --- |
| `node --test e2e/lib/__tests__/` | 신규 헬퍼 테스트 전부 PASS (playwright 미설치 상태에서) |
| `npm test --prefix frontend` | 기존 + 신규 `ingameE2eHooks.test.js` PASS |
| `npm run lint --prefix frontend` | PASS |
| `npm run build --prefix frontend` | PASS |
| `npm run test:game-core` | PASS (backend 무변경 — 회귀 없음 확인용) |

헬퍼 테스트가 실제로 덮는 것:
- `parseDotEnv`: 주석·빈 줄·따옴표·`=` 포함 값·CRLF.
- `resolveE2eAccounts`: 5개 정상 / 3번 계정 누락 시 `E2E_USER3_PASSWORD`를 지목해 throw.
- `ROOM_SETUP_PLAN`: 조작 순서와 클릭 횟수가 (10→5, 자동→직접, 2→1, 0→1×3)과 정확히 일치. `getRoleCountRange(JOKER, 5)`의 상한을 넘기지 않음.
- `planNight`: n=1..9에서 JOKER/DOCTOR 대상이 항상 S5, GUARD·WH 대상이 **매일 다르고 자기 자신이 아니며 서로 겹치지 않음**, 4밤 주기로 순환. n=10에서 DOCTOR가 S3, GUARD/WH가 SKIP, `expectedDeathSeat === S5`.
- `planDay`: dayIndex 1..10은 전원 기권/ABSTAINED, 11은 비-JOKER 3명이 S1 지목 + JOKER 기권/TRIBUNAL, **어떤 좌석도 자기 자신에게 투표하지 않음**.
- `witchHunterCanActOn`: `0 → false`, `1 → true`, `10 → true` (요구서의 day0 스킵 규칙 자체는 여기서 고정된다 — §6).
- `expectedInvestigateLabel/expectedConfirmLabel/expectedKillRevealMessage`: 프로덕션 빌더가 만든 문자열과 문자 단위 일치(`"… 님은 광대 진영입니다"` / `"… 님은 시민 진영입니다"` / `"… 님의 역할은 …입니다"` / `"광대들이 … 님을 죽였습니다."`).
- `selectors.js`: 각 빌더가 `INGAME_E2E_ATTRS`의 이름을 쓰고 인용부호를 이스케이프함.
- `ingameE2eHooks.test.js`: 빌더 순수 계약 + 세 `.jsx`가 실제로 그 빌더를 쓰는지 소스 대조.

---

## 6. 요구서와 실제 코드가 어긋나는 지점 (그대로 진행하되 명시)

**마녀사냥꾼 day0 스킵은 배포 흐름에서 도달할 수 없다.**
요구서는 "WITCH_HUNTER는 day0(1일차)에 skip 자동 진행을 검증"이라고 적었다. 그러나 §0에서 확인했듯 게임의 첫 진행 단계는 `DAY dayIndex 1`이고, 첫 밤은 `NIGHT dayIndex 1`이다. `nightActionMinDayIndex=1`이므로 **첫 밤부터 마녀사냥꾼은 이미 행동 가능**하다. `dayIndex 0`인 NIGHT은 유닛 테스트에서만 존재한다(`nightTurnProgression.test.js`가 세션을 직접 조립해 만든다).

대응:
- 스크립트는 스킵 여부를 하드코딩하지 않고 **화면에서 읽은 canonical dayIndex를 `witchHunterCanActOn()`에 넣어** 그 밤에 "확인" 패널을 기대할지 `"이 밤에는 행동할 수 없습니다."`를 기대할지 정한다. 그래서 흐름이 어느 쪽이든 스크립트는 옳다.
- day0 스킵 분기 자체는 `witchHunterCanActOn(0) === false` 단위 테스트로 고정한다.
- `e2e/README.md`에 "현재 배포 흐름에서는 1일차 밤부터 마녀사냥꾼이 행동 가능하므로 E2E가 스킵 분기를 실제로 밟지 않는다"를 남긴다.
- 이걸 정말 E2E로 밟게 하려면 backend의 첫 전이(`ROLE_REVEAL → DAY`)를 바꿔야 하는데, 이번 작업은 backend를 수정하지 않는다.

**"생존 전원이 JOKER 투표"는 JOKER 본인에게 불가능하다.** 서버가 `SELF_TARGET_NOT_ALLOWED`로 거부하고 UI 목록에도 자기 자신이 없다. 비-JOKER 3명 투표 + JOKER 기권으로 진행한다 — 집계 결과는 요구서의 의도대로 TRIBUNAL·대상 JOKER다.

**요구서 마지막 줄이 "처형 →"에서 잘려 있다.** 코드가 강제하는 유일한 후속(생존 JOKER 0 → `evaluateWinCondition` CITIZEN 승 → `finalizeGameSession` ENDED → `useInGameResultNavigation`이 `/gameresult`로 replace)을 그대로 이어 검증한다: 5창 전부 결과 페이지 도달, S1만 "패배"·나머지 "승리", 전원 정체 공개 목록(`광대/주치의/경비원/귀족`), "로비로" 버튼 노출.

**요구서에 없는 DAY 1 구간이 필수다.** 첫 밤에 닿으려면 반드시 DAY 1을 기권으로 통과해야 한다. 스크립트에 명시적 스텝(`"부트스트랩 DAY 1 — 요구서 루프 진입용"`)으로 넣는다.

---

## 7. 위험과 완화

| 위험 | 완화 |
| --- | --- |
| 입장 순서가 뒤섞여 역할이 어긋남 | S2~S5 입장을 순차 await. 역할 공개 검증에서 좌석↔역할이 어긋나면 **즉시 실패**(뒤 단계를 헛돌리지 않는다) |
| DEBUG_FIXED_ROLES가 조용히 무시됨 | 역할 공개 검증이 첫 관문. 추가로 README에 CUSTOM 5인 구성이 필수임을 명시하고 `ROOM_SETUP_PLAN`이 그 구성을 강제 |
| 오버레이 backdrop이 클릭을 삼킴 | 모든 상호작용 전에 `settleOverlays()` 통과. 밤 턴 안내도 타이머를 기다리지 않고 명시적으로 닫음 |
| `inert` 때문에 클릭이 조용히 무시됨 | 클릭 대상 버튼이 `enabled`가 될 때까지 `expect(...).toBeEnabled()`로 대기한 뒤에만 클릭 |
| 사망 영상 자동재생 거부 | `--autoplay-policy=no-user-gesture-required` + `"다시 재생"/"건너뛰기"` 양쪽 경로 처리 |
| 21×5회 오버레이로 인한 총 실행 시간 | 테스트 타임아웃 15분, `workers:1`. README에 예상 소요를 적음 |
| e2e가 frontend 순수 모듈을 import → 프런트 리팩터링 시 깨짐 | 그게 목적이다(문구 드리프트 즉시 발각). 단, import 대상은 React/소켓 의존이 전혀 없는 4개 모듈로 한정 |
| 새 `data-*`가 다른 참가자의 role을 노출 | `buildInGamePlayerCardE2eAttrs`는 nickname/status/self만 받는다. 단위 테스트가 role/team 키 부재를 단정 |
| Windows에서 `node --test src/**/...` glob 미확장 | 신규 스크립트는 디렉터리 경로(`e2e/lib/__tests__/`)를 넘긴다 |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| CREATE | e2e/package.json |  | e2e 독립 패키지(type=module, playwright devDep, test/test:helpers 스크립트) |
| CREATE | e2e/playwright.config.js |  | 단일 워커·15분 타임아웃·baseURL·autoplay 허용 런치 옵션 |
| CREATE | e2e/README.md |  | 실행 전제(DEBUG_FIXED_ROLES·CUSTOM 5인 방 필수·계정 5개)와 실행 순서 |
| CREATE | e2e/.env.example |  | E2E_BASE_URL과 테스트 계정 5쌍의 placeholder |
| CREATE | e2e/lib/env.js |  | .env 파싱과 좌석별 계정 해석(순수) |
| CREATE | e2e/lib/scenarioPlan.js |  | 방 설정 조작·10일 밤낮 계획·기대 문구를 프로덕션 빌더로 산출(순수) |
| CREATE | e2e/lib/selectors.js |  | data 훅 이름에서 Playwright 셀렉터 문자열 생성(순수) |
| CREATE | e2e/lib/actors.js |  | 좌석 page-object — 로그인·방 생성/입장·오버레이 정리·행동 제출 |
| CREATE | e2e/lib/__tests__/env.test.js |  | env 파싱·계정 해석 단위 테스트 |
| CREATE | e2e/lib/__tests__/scenarioPlan.test.js |  | 순환 대상·투표 계획·기대 문구·마녀사냥꾼 min-day 단위 테스트 |
| CREATE | e2e/lib/__tests__/selectors.test.js |  | 셀렉터 빌더 단위 테스트 |
| CREATE | e2e/tests/tenDayScenario.spec.js |  | 5창 10일차 시나리오 재생 스펙 |
| CREATE | frontend/src/domains/game/ingame/constants/e2e/ingameE2eHooks.js |  | E2E data 속성 이름과 속성 빌더의 단일 원천 |
| CREATE | frontend/src/domains/game/ingame/constants/e2e/__tests__/ingameE2eHooks.test.js |  | 빌더 순수 계약 + 세 컴포넌트의 실제 사용 소스 대조 |
| MODIFY | frontend/src/domains/game/ingame/components/actions/InGameActionPanel.jsx |  | 컨트롤 패널 aside에 phase/dayIndex/self-role data 훅 부착 |
| MODIFY | frontend/src/domains/game/ingame/components/actions/InGameTargetPicker.jsx |  | 대상 버튼에 target-id data 훅 부착 |
| MODIFY | frontend/src/domains/game/ingame/components/board/InGamePlayerCard.jsx |  | 플레이어 카드에 nickname/status/self data 훅 부착 |
| MODIFY | package.json |  | test:e2e-helpers·test:e2e 스크립트 추가 |
| MODIFY | .gitignore |  | playwright 산출물 디렉터리 무시 |
| REFERENCE | backend/game-core/gameSession.js |  | 단계 전이·역할 고정 배정·승리 조건의 canonical 근거 |
| REFERENCE | backend/game-core/roleComposition.js |  | 5인 방이 CUSTOM이어야 하는 이유(특수 역할 budget) |
| REFERENCE | backend/socket/gameSession.js |  | 밤 자동 판정·game_ended 방송 시점 |
| REFERENCE | backend/socket/matchmaking.js |  | 전원 준비 요구(computeCanStart) |
| REFERENCE | backend/.env.example |  | DEBUG_FIXED_ROLES 설정 문구 |
| REFERENCE | frontend/src/domains/game/ingame/constants/roleReveal/ingameRoleRevealData.js |  | 역할 공개 문구 원천(기대값 재사용) |
| REFERENCE | frontend/src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js |  | 조사·확인 결과 문구 원천(기대값 재사용) |
| REFERENCE | frontend/src/domains/game/ingame/constants/killReveal/ingameKillReveal.js |  | 사망 연출 문구·건너뛰기 라벨 원천 |
| REFERENCE | frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js |  | 밤 행동 라벨·min-day·재판 라벨 원천 |
| REFERENCE | frontend/src/domains/game/ingame/constants/phaseEntrance/ingamePhaseEntrance.js |  | 진입 연출 문구·확인 라벨 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameOverlayStack.js |  | 오버레이 우선순위와 상호작용 차단 규칙 |
| REFERENCE | frontend/src/domains/game/setup/utils/roleComposition.js |  | 역할 스테퍼 범위(ROOM_SETUP_PLAN 계산 근거) |
| REFERENCE | frontend/src/domains/game/setup/constants/gameSetupOptions.js |  | 설정 항목 기본값·라벨(스테퍼 aria-label 근거) |
| REFERENCE | frontend/src/shared/ui/Stepper.jsx |  | "{라벨} 감소/증가" aria-label 규칙 |
| REFERENCE | frontend/src/app/routes/index.jsx |  | 스크립트가 오갈 라우트 경로 |
