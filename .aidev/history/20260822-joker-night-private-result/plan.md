# NIGHT 개인 조사 결과 오버레이 — 구현 계획

## 0. 조사로 확인된 사실 (구현 전제)

- **backend 계약 확인 완료** (`backend/socket/gameSession.js:827-855`): 한 소켓에 대해 emit 순서는 항상 `night_actions_resolved` → `night_action_result` → `night_result_applied` 이다. 따라서 `useInGameResolveNight`의 기존 단조 폐기 규칙(`appliedNightDayIndexRef`)은 정상 경로에서 절대 신선한 개인 결과를 버리지 않는다. payload는 `{gameId, dayIndex, ...privateResult}`이고 privateResult는 `{actionType:'INVESTIGATE', targetId, team}` 또는 `{actionType:'CONFIRM', targetId, role}` (`backend/game-core/gameSession.js:986-995`). backend는 건드리지 않는다.
- **테스트 실행 방식**: `frontend/package.json:11` → `node --experimental-test-module-mocks --test src/**/__tests__/*.test.js`. 변환기가 없으므로 **테스트는 `.jsx`를 import할 수 없다**. 그래서 `InGameKillRevealOverlay.js`/`InGamePhaseEntranceOverlay.js`/`InGameParchmentPanelBase.js`는 `.js` + `createElement`로 작성돼 있다. 요구사항이 명시한 `InGameNightPrivateResultOverlay.jsx`는 그대로 `.jsx`로 만들되(요구사항 우선), 그 대가로 이 컴포넌트만 DOM 단위 테스트 대상이 아니게 된다 — 검증은 raw source 검사(`InGamePage.productionSource.test.js`와 동일한 관례)로 대체한다. 요구사항의 검증 목록에도 컴포넌트 DOM 테스트는 없다.
- **`npm run check:utf8`은 현재 깨져 있다**: `frontend/scripts/verify-utf8.mjs`가 저장소에 없다(`frontend/scripts/` 디렉터리 자체가 없음). 이번 작업에서 고치지 않는다 — 검증 명령에서 제외한다.
- **store의 `state`는 스냅샷 하이드레이션에서 통째로 새로 만들어진다**(`store/applySessionSnapshot.js:211-223`). 따라서 개인 결과를 `state` 안에 넣으면 재접속 시 사라진다 → **store 최상위 필드**(`snapshotSeq`와 같은 층)로 둔다.
- store가 NIGHT로 전이하는 경로는 네 곳: `applyPhaseChanged`(legacy dayIndex 0), `applyDayVoteResolvedToPhase`(TIE/ABSTAINED), `applyTribunalResolvedPure`(TRIBUNAL→NIGHT, `store/applyTribunalResolved.js:93-109`), `applySessionSnapshotPure`(하이드레이션). 네 곳 모두 `{state:...}` 패치를 반환하므로 공통 래퍼 하나로 clear를 걸 수 있다.
- `nightActionResult`의 현재 소비처는 `useInGameActionPanel.js:407` → `InGameActionPanel.jsx:158,427-437`의 **디버그용 `JSON.stringify` 한 줄**뿐이다. 이를 참조하는 테스트는 없다(`computeResolveNightInvalidatePatch.test.js`만 해당 필드명을 언급).

---

## 1. 변경/신규 파일 목록

### 신규
| 파일 | 내용 |
|---|---|
| `frontend/src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js` | 순수 정규화 함수 |
| `frontend/src/domains/game/ingame/constants/nightPrivateResult/ingameNightPrivateResult.js` | 라벨·클래스 상수(z 단계 포함) |
| `frontend/src/domains/game/ingame/components/nightPrivateResult/InGameNightPrivateResultOverlay.jsx` | 오버레이 |
| `frontend/src/domains/game/ingame/hooks/useInGameNightPrivateResult.js` | 오버레이 스택 4번째 항목의 표시 상태 훅 |
| `frontend/src/domains/game/ingame/utils/__tests__/reduceInGameNightPrivateResult.test.js` | 단위 테스트 |
| `frontend/src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.nightPrivateResult.test.js` | 우선순위 + 결과 보존 통합 테스트 |

### 수정
| 파일 | 요지 |
|---|---|
| `store/ingameStore.js` | `nightPrivateResult` 상태 + 2개 액션 + NIGHT 재진입 clear 래퍼 |
| `store/__tests__/ingameStore.test.js` | 보존/clear 시점 테스트 추가 |
| `hooks/useInGameResolveNight.js` | 로컬 `nightActionResult` state 제거, `handleResult`가 store를 갱신 |
| `hooks/useInGameOverlayStack.js` | 2·3번 사이에 삽입, hold/interactionBlocked/주석 갱신 |
| `hooks/useInGameActionPanel.js` | `nightActionResult` 반환 제거 |
| `components/actions/InGameActionPanel.jsx` | 디버그 JSON 표시 줄 제거 |
| `utils/computeResolveNightInvalidatePatch.js` + 그 테스트 | 패치에서 `nightActionResult` 제거 |
| `pages/InGamePage.jsx` | 오버레이 마운트·배선 |

---

## 2. 파일별 상세

### 2.1 `utils/reduceInGameNightPrivateResult.js` (신규, 순수 함수)

```js
import { getInGameRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"

export function reduceInGameNightPrivateResult(payload, players) { ... }
```

계약:
- 입력: `payload`(store의 `nightPrivateResult`, 신뢰하지 않는 외부 입력 유래), `players`(canonical roster 배열).
- 출력: `{ kind: "INVESTIGATE"|"CONFIRM", targetNickname, label }` 또는 `null`.
- 거부(→ `null`) 조건: payload가 객체가 아님/배열, `actionType`이 두 값이 아님, `targetId`가 비어있지 않은 문자열이 아님, `players`가 배열이 아님, **`targetId`가 roster에 없음**, 대상 player의 `nickname`이 비어있음, `team`/`role`이 `getInGameRoleRevealDisplay`에서 `null`(알 수 없는 값).
- 라벨 조립(정확히 이 문자열):
  - `INVESTIGATE`: `` `${nickname} 님은 ${display.teamLabel}입니다` `` — `display = getInGameRoleRevealDisplay(payload.team)`. JOKER→"광대 진영", CITIZEN→"시민 진영".
  - `CONFIRM`: `` `${nickname} 님의 역할은 ${display.name}입니다` `` — `display = getInGameRoleRevealDisplay(payload.role)`. 광대/시민/의사/경비대/마녀사냥꾼.
- `INVESTIGATE`에서 `team`은 `JOKER|CITIZEN`만 허용한다(`DOCTOR` 같은 role 값이 team 자리에 오면 `getInGameRoleRevealDisplay`가 값을 돌려주긴 하므로, 명시적 화이트리스트로 걸러 `null`을 반환).
- uuid는 어떤 경우에도 화면 문자열에 넣지 않는다(`ingameKillReveal.js`의 관례). 다만 여기서는 대체 닉네임을 쓰지 않고 **표시 자체를 포기(null)** 한다 — 요구사항 2 명시.

### 2.2 `constants/nightPrivateResult/ingameNightPrivateResult.js` (신규)

`ingamePhaseEntrance.js`와 동일한 구조로 문자열/클래스만 소유한다(파치먼트 이미지 URL은 재정의하지 않는다):
- `INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL = "확인"`
- `INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL = "밤 조사 결과"`
- `INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_LABEL = "밤 조사 결과 닫기"`
- backdrop/panel-wrap/panel/message/confirm-button 클래스: `INGAME_PHASE_ENTRANCE_*`와 같은 값으로 두되 **z 단계만 `z-[65]` / `z-[66]`** — killReveal(z-70/71) 아래, phaseEntrance(z-60/61) 위. 우선순위 겹침이 생겨도 렌더 순서가 아니라 z 단계가 결정하게 한다(기존 주석 정책 그대로).

별도 상수 파일을 두는 이유: 컴포넌트 파일에서 상수를 export하면 `react-refresh/only-export-components` 계열 규칙과 충돌하고, phaseEntrance 상수를 직접 import하면 z 단계가 공유돼 두 오버레이가 같은 층에 겹친다.

### 2.3 `components/nightPrivateResult/InGameNightPrivateResultOverlay.jsx` (신규)

`InGamePhaseEntranceOverlay.js`와 동일한 계약을, JSX 문법으로:
- props: `{ open, kind, label, onConfirm }`.
- `active = Boolean(open) && typeof label === "string" && label.length > 0`; 아니면 `null` 반환.
- Escape 키 → `onConfirm()` (`window.addEventListener("keydown")`, `[active, onConfirm]` deps에서 등록/해제).
- 열릴 때 확인 버튼으로 focus 이동(`confirmButtonRef`, deps `[active, label]`).
- 마크업: `data-ingame-night-private-result={kind}` 래퍼 → backdrop `<button>`(aria-label, onClick=onConfirm) → panel wrap → `role="dialog" aria-modal="true" aria-label` → `<InGameParchmentPanel>`(`.jsx` 껍데기) 안에 `<p>{label}</p>` + 확인 `<button>`.
- 표시 전용: 소켓 emit 없음. `onConfirm`은 store의 `clearNightPrivateResult`로만 이어진다(canonical phase·역할 턴은 움직이지 않는다). 이 사실을 파일 상단 주석에 명시한다.

### 2.4 `store/ingameStore.js` (수정)

1. 최상위 상태 추가:
```js
// GUARD/WITCH_HUNTER 본인에게만 오는 1회성 개인 조사 결과(night_action_result).
// state(서버 세션 미러) 안이 아니라 최상위에 둔다 — applySessionSnapshotPure가 state를 통째로
// 새로 만들기 때문에 그 안에 두면 재접속 하이드레이션에서 조용히 사라진다. 이 값은
// night_result_applied(DAY 전이)로는 절대 지워지지 않는다. 지워지는 곳은 정확히 세 곳:
// 오버레이 확인(clearNightPrivateResult) · NIGHT 재진입 · gameId 변경.
nightPrivateResult: null,
```
2. `setNightPrivateResult(payload)`: 다른 액션과 같은 방어 검증 후에만 반영, 그 외에는 `current` 참조 그대로(no-op). 검증 항목 — 객체/비배열, `gameId` 비어있지 않은 문자열이며 `current.gameId`와 일치, `current.gameId`·`current.state` 존재, `Number.isInteger(dayIndex)`, `actionType ∈ {INVESTIGATE, CONFIRM}`, `targetId`가 비어있지 않은 문자열. 저장은 `{ ...payload }` 얕은 복사(호출부가 이후 payload를 변형해도 store에 영향 없음).
3. `clearNightPrivateResult()`: 이미 `null`이면 `current` 반환(참조 보존 no-op).
4. 모듈 private 헬퍼:
```js
// state 패치가 "NIGHT로 새로 들어가는" 전이일 때만 개인 결과를 함께 비운다. 이미 NIGHT인 상태의
// 갱신(night_turn_changed 등)은 대상이 아니다 — 그 밤에 방금 받은 결과를 지워버리면 안 된다.
function withNightReentryClear(current, patch) {
  if (patch === current) return current
  if (patch.state?.phase !== "NIGHT") return patch
  if (current.state?.phase === "NIGHT") return patch
  if (current.nightPrivateResult === null) return patch
  return { ...patch, nightPrivateResult: null }
}
```
   적용 지점: `applyPhaseChanged`의 반영 반환, `applyDayVoteResolvedToPhase`의 TRIBUNAL/TIE·ABSTAINED 반환, `applyTribunalResolved`, `applySessionSnapshot`(기존 `snapshotSeq` 증가와 합성: `{ ...withNightReentryClear(current, patch), snapshotSeq: current.snapshotSeq + 1 }`). `applyNightResultAppliedPayload`는 DAY/ENDED만 만들므로 래핑하지 않고, "여기서는 절대 지우지 않는다"를 주석으로 못박는다(요구 1의 핵심 계약).
5. `setGamePayload`에 `nightPrivateResult: null` 추가(gameId 변경 = 새 세션), `clearGame`에도 추가.

### 2.5 `hooks/useInGameResolveNight.js` (수정)

- `const [nightActionResult, setNightActionResult] = useState(null)` 제거, 반환 객체에서 `nightActionResult` 제거.
- `invalidate()`에서 `setNightActionResult(patch.nightActionResult)` 제거(개인 결과는 더 이상 이 훅의 소유가 아니다 — disconnect/재연결/unmount로 지워지지 않는다는 뜻이며, 이는 요구 1의 의도된 결과다. 주석으로 명시).
- `handleResult`:
```js
const handleResult = (payload) => {
  if (!shouldApplyNightBroadcastPayload({ payload, gameId })) return
  // (기존 주석 유지) 이미 DAY로 적용된 NIGHT과 같거나 오래된 결과는 폐기한다.
  if (appliedNightDayIndexRef.current !== null && payload.dayIndex <= appliedNightDayIndexRef.current) return
  useInGameStore.getState().setNightPrivateResult(payload)
}
```
  `mountedRef` 검사는 뺀다 — 리스너는 cleanup에서 해제되고, store 갱신은 컴포넌트 state가 아니라 전역이라 unmount와 무관하다. `appliedNightDayIndexRef`의 `[gameId]` 초기화 effect는 그대로 둔다.
- 훅 상단 JSDoc의 "그대로 저장해 표시용으로만 쓴다" 문장을 "store의 `nightPrivateResult`로 넘겨 오버레이가 소비한다"로 갱신.

### 2.6 `utils/computeResolveNightInvalidatePatch.js` + 테스트 (수정)

반환을 `{ status: "idle", error: null }`로 줄이고 주석에서 개인 결과 문단을 제거(개인 결과는 store 소유임을 한 줄로 대체). 테스트(`computeResolveNightInvalidatePatch.test.js`)의 이름·기대값에서 `nightActionResult`를 제거한다.

### 2.7 `hooks/useInGameNightPrivateResult.js` (신규)

```js
export function useInGameNightPrivateResult({ hold = false } = {}) {
  const payload = useInGameStore((s) => s.nightPrivateResult)
  const players = useInGameStore((s) => s.state?.players ?? null)
  const confirm = useInGameStore((s) => s.clearNightPrivateResult) // 액션 참조는 store 생성 시 고정
  const display = reduceInGameNightPrivateResult(payload, players)
  return { open: !hold && display !== null, kind: display?.kind ?? null, label: display?.label ?? null,
           targetNickname: display?.targetNickname ?? null, confirm }
}
```
- hold 중에는 열지 않지만 **소비되지도 않는다** — 결과는 canonical store에 있고 clear는 오직 confirm/NIGHT 재진입/gameId 변경뿐이므로 별도 pending 큐가 필요 없다. 이 점이 killReveal/phaseEntrance가 reducer로 pending을 관리해야 했던 것과 다른 이유를 주석으로 남긴다.
- 표시 전용(소켓 emit 없음)임을 주석에 명시.

### 2.8 `hooks/useInGameOverlayStack.js` (수정)

```js
const roleReveal = useInGameRoleReveal()
const killReveal = useInGameKillReveal({ hold: roleReveal.open })
const nightPrivateResult = useInGameNightPrivateResult({ hold: roleReveal.open || killReveal.open })

const higherPriorityActive = roleReveal.open || killReveal.open || nightPrivateResult.open
const phaseEntrance = useInGamePhaseEntrance({ hold: higherPriorityActive })
const nightTurn = useInGameNightTurnAnnouncement({ hold: higherPriorityActive || phaseEntrance.armed })

return { roleReveal, killReveal, nightPrivateResult, phaseEntrance, nightTurn,
         interactionBlocked: phaseEntrance.blocking || killReveal.open || nightPrivateResult.open }
```
- 주석의 우선순위 목록을 1 역할 공개 / 2 사망 연출 / **3 개인 조사 결과(GUARD·WITCH_HUNTER 본인)** / 4 DAY·NIGHT 진입 연출 / 5 밤 역할 턴 안내 / 6 게임 표면으로 갱신하고, "3번은 확인 버튼을 누를 때까지 소비되지 않으므로 4·5번이 그 뒤로 밀린다"를 명시한다.
- `higherPriorityActive`는 그대로 두되 이름이 가리키는 대상이 3개가 됐음을 주석으로 반영한다.

### 2.9 `pages/InGamePage.jsx` (수정)

- import 추가, 구조분해에 `nightPrivateResult` 추가.
- 상호작용 래퍼 **바깥**(다른 오버레이들과 같은 블록)에 마운트. 렌더 순서는 `nightTurn → phaseEntrance → nightPrivateResult → killReveal → roleReveal`(z 오름차순 관례 유지):
```jsx
<InGameNightPrivateResultOverlay
  open={nightPrivateResult.open}
  kind={nightPrivateResult.kind}
  label={nightPrivateResult.label}
  onConfirm={nightPrivateResult.confirm}
/>
```
- `InGamePage.productionSource.test.js:43-57`은 나열된 4개 오버레이만 검사하므로 위치만 지키면 그대로 통과한다.

### 2.10 `useInGameActionPanel.js` / `InGameActionPanel.jsx` (수정)

- 훅 반환에서 `nightActionResult: resolveNightRequest.nightActionResult` 제거.
- 패널의 구조분해(`:158`)와 디버그 표시 블록(`:427-437`, `개인 결과: {JSON.stringify(...)}`) 제거 — 정식 오버레이가 그 자리를 대신한다. 이 줄을 참조하는 테스트는 없다(확인 완료).

---

## 3. 테스트 계획

### 3.1 `utils/__tests__/reduceInGameNightPrivateResult.test.js` (신규)
- INVESTIGATE / `team:"JOKER"` → `{kind:"INVESTIGATE", targetNickname:"홍길동", label:"홍길동 님은 광대 진영입니다"}`
- INVESTIGATE / `team:"CITIZEN"` → `"… 님은 시민 진영입니다"`
- CONFIRM × 5 (`JOKER|CITIZEN|DOCTOR|GUARD|WITCH_HUNTER`) → `"… 님의 역할은 광대|시민|의사|경비대|마녀사냥꾼입니다"` (테이블 드리븐)
- **targetId가 players에 없음 → `null`**
- 거부 케이스 테이블: `null`/`undefined`/배열 payload, `players`가 배열 아님, `actionType:"KILL"`, `targetId:""`, INVESTIGATE인데 `team:"DOCTOR"`, CONFIRM인데 `role:"UNKNOWN"`, 대상의 `nickname`이 빈 문자열 → 전부 `null`
- 순수성: 호출이 입력 payload/players를 변형하지 않는다(`deepEqual` 스냅샷 비교)

### 3.2 `store/__tests__/ingameStore.test.js` (기존 파일에 섹션 추가)
- `setNightPrivateResult`: 유효 payload 저장; **다른 gameId·비정수 dayIndex·잘못된 actionType·빈 targetId → store 최상위 참조 보존 no-op**
- **`applyNightResultAppliedPayload`(DAY 전이) 후에도 `nightPrivateResult`가 그대로 유지된다** (요구 1의 핵심)
- `applyDayVoteResolvedToPhase(TIE)` → NIGHT 재진입 → `null`
- `applyTribunalResolved`(TRIBUNAL→NIGHT payload) → `null`
- `applySessionSnapshot`이 NIGHT로 하이드레이션 → `null` (단, 이미 NIGHT인 상태의 재적용은 유지)
- **`applyNightTurnChanged`(NIGHT 중 턴 변경)는 지우지 않는다** — transition-only 규칙 증명
- `setGamePayload`(다른 gameId) → `null`, `clearGame` → `null`
- `clearNightPrivateResult`: 값이 있으면 지우고, 이미 `null`이면 참조 보존 no-op

### 3.3 `hooks/__tests__/useInGameOverlayStack.nightPrivateResult.test.js` (신규)
`useInGameOverlayStack.killReveal.test.js`의 JSDOM + `mock.module("…/socketClient.js")` 하네스를 그대로 복제한다(같은 파일 내 fake socket / `applyCanonicalState` 헬퍼).
- **killReveal 열림 → `nightPrivateResult.open === false`**(대기), `killReveal.consume(...)` 후 `open === true`
- **`nightPrivateResult.open === true`인 동안 `phaseEntrance.open === false`, `nightTurn.open === false`, `interactionBlocked === true`**
- `nightPrivateResult.confirm()` 후 store의 `nightPrivateResult === null`, `phaseEntrance.open === true`("낮이 되었습니다")
- 역할 공개가 떠 있는 동안에는 개인 결과도 대기한다(1번 우선)
- `label`이 만들어지지 않는 결과(roster에 없는 targetId)는 아예 열리지 않고 뒷 순서를 막지 않는다
- **결과 보존 통합**: 같은 `renderHook`에서 `useInGameOverlayStack()`과 `useInGameResolveNight()`을 함께 마운트 → fake socket으로 `night_action_result`(dayIndex 1) → `night_result_applied`(DAY, dayIndex 2) 순서로 fire + `applyNightResultAppliedPayload`로 canonical DAY 전이 재현 → **store의 `nightPrivateResult`가 살아 있고 오버레이가 열린다**
- confirm/consume이 어떤 `emit`/`emitWithAck`도 만들지 않는다(표시 전용)
- raw source 검사: `InGamePage.jsx`에 `InGameNightPrivateResultOverlay`가 `open={nightPrivateResult.open}` / `label={nightPrivateResult.label}` / `onConfirm={nightPrivateResult.confirm}`로 배선돼 있고 `</InGamePlayerSessionProvider>` 뒤에 위치한다 (`.jsx`라 직접 렌더할 수 없으므로 이 방식으로 대체)

### 3.4 회귀
`computeResolveNightInvalidatePatch.test.js` 수정 외에 기존 테스트는 수정하지 않는다. 특히 `useInGameOverlayStack.killReveal.test.js` / `.nightTurn.test.js`는 `nightPrivateResult`가 항상 비어 있으므로(store 초기값 `null`) 그대로 통과해야 한다 — 통과하지 않으면 hold 배선이 잘못된 것이다.

---

## 4. 검증 (PowerShell, 저장소 루트 기준)

```powershell
cd frontend
npm test          # 신규 3종 + 기존 전체 PASS
npm run lint      # eslint (react-hooks deps 포함)
npm run build     # vite build PASS
```
`npm run check:utf8`은 스크립트 파일이 저장소에 없어 실패하므로 실행하지 않는다(이번 작업 범위 밖). 새 파일은 모두 UTF-8(BOM 없음)로 작성한다.

수동 확인(선택): GUARD로 밤 조사 → 판정 → 사망 연출이 있으면 그것부터 재생 → 개인 결과 파치먼트("○○ 님은 시민 진영입니다") → 확인 → "낮이 되었습니다" → 밤 역할 턴 안내 순서.

---

## 5. 수정 금지 (재확인)

- `backend/**` 전체 — 읽기만 했고 한 줄도 바꾸지 않는다.
- DAY Enter-to-send 채팅 관련 코드(`InGameChatInput.jsx` 등).
- 밤 턴 안내 문구(`constants/nightTurn/ingameNightTurnAnnouncement.js`). GUARD의 표시명이 역할 공개 데이터에서는 "경비대"인데 밤 안내는 "경호원"일 수 있다 — **이번 작업에서는 `getInGameRoleRevealDisplay`만 재사용하고 안내 문구는 건드리지 않는다**(요구사항 명시: 별도 작업).

---

## 6. 위험 요소와 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| NIGHT clear를 "결과 phase가 NIGHT"로 구현하면 `night_turn_changed`가 그 밤에 방금 받은 결과를 지운다 | 결과가 화면에 뜨지 못함(현 버그 재발) | `withNightReentryClear`를 **이전 phase ≠ NIGHT** 전이로 한정. 전용 회귀 테스트(3.2) 추가 |
| `.jsx` 오버레이는 node --test로 렌더 검증 불가 | 마크업/Escape 계약 회귀를 자동 검출 못 함 | 요구사항이 `.jsx`를 명시했으므로 그대로 따르고, `InGamePage` 배선은 raw source 검사로 고정. 향후 DOM 테스트가 필요해지면 `.js`+`createElement`로 옮기는 것이 기존 관례 |
| z 단계 충돌(개인 결과가 killReveal 위에 그려지거나 phaseEntrance 아래로 깔림) | 시각적 우선순위 역전 | z-[65]/[66]로 60대와 70대 사이에 고정. hold 관계와 z 단계를 둘 다 명시 |
| store 최상위 필드 추가로 기존 `useInGameStore.setState({...})` 초기화 테스트가 필드를 빠뜨림 | 테스트 간 상태 누수 | 새 테스트는 `setState`에 `nightPrivateResult: null`을 포함. 기존 테스트는 초기값이 `null`이라 영향 없음 |
| `night_action_result`가 `night_result_applied`보다 늦게 도착(재연결 중 순서 뒤바뀜 등) | 단조 규칙에 걸려 결과가 버려짐 | 요구 5가 기존 규칙 유지를 명시했으므로 그대로 둔다. 단일 소켓 emit 순서는 backend에서 보장됨(0절) — 동작상 문제 없음. 이 트레이드오프를 `handleResult` 주석에 남긴다 |
| 패널의 디버그 JSON 제거로 "결과가 안 보인다"고 오인 | — | 오버레이가 정식 표시 경로이므로 의도된 제거. 커밋 메시지/보고에 명시 |
| 재접속(스냅샷)으로 그 밤에 복원될 때 개인 결과가 사라짐 | GUARD가 조사 결과를 못 봄 | 서버가 개인 결과를 재전송하지 않으므로 프론트만으로는 복구 불가. NIGHT 하이드레이션은 재진입으로 간주해 clear한다(요구 1(b)와 일관). 알려진 한계로 보고 |


approved: InGameNightPrivateResultOverlay는 .jsx가 아니라 기존 관례대로 .js + createElement로 작성하고, raw source 검사 대신 InGameKillRevealOverlay.test.js와 같은 방식의 DOM 단위 테스트를 추가한다. 나머지는 계획대로.
