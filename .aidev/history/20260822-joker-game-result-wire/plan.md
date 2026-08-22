# 게임 결과 페이지에 실제 winResult 연결 — 구현 계획

## 0. 사전 확인으로 확정된 사실 (코드 근거)

| 확인 항목 | 결과 | 근거 |
| --- | --- | --- |
| backend가 싣는 winResult | `{winner, reveals:[{uuid,nickname,role,team,alive}], mvp:null}` | `backend/game-core/gameSession.js:285` `buildTerminalFields` + `:261` `buildEndedRoleReveals` |
| 세 프런트 파서가 winner만 취함 | `winResult = { winner: ... }` 로 잘라 버림 | `applySessionSnapshot.js:186`, `applyTribunalResolved.js:50`, `parseNightResultAppliedPayload.js:39` |
| `GameResultMvpPanel`의 null 처리 | `if (!mvp) return null` — null을 이미 안전하게 처리 | `GameResultMvpPanel.jsx:21` |
| ⇒ 요구 2의 "조건부 렌더" 분기 | **불필요.** 컴포넌트/Shell 무수정 확정 | 위와 같음 |
| `game_ended`는 자연 종료 시 오지 않음 | `finalizeGameSessionEnd`(이탈·disconnect 경로)에서만 emit | `backend/socket/gameSession.js:1272,1280` |
| ⇒ 자연 ENDED에서는 `clearGame()`이 돌지 않음 | store의 winResult가 결과 페이지까지 살아남는다 | `createGameEndedHandler.js:12` → `createSessionEndFinalizer.js:10` |
| 결과 페이지의 "나가기 버튼" | **존재하지 않는다** (Shell/Banner/PlayerList/MvpPanel/Row 어디에도 버튼 없음) | `domains/game/result/**` 전체 grep 결과 0건 |
| 테스트 실행기 | `node --experimental-test-module-mocks --test src/**/__tests__/*.test.js` — **JSX 로더가 없다** | `frontend/package.json:11` |
| ⇒ `.jsx`는 렌더 테스트 불가 | raw source 검증 관례를 따른다 | `InGamePage.productionSource.test.js:7-12` |
| `react-router-dom` 모킹 선례 | `mock.module("react-router-dom", { namedExports: { useNavigate } })` | `useGameSessionSocketEvents.nightTurn.test.js:56` |

**나가기 버튼 관련 결론**: 요구 4의 "나가기 버튼이 기존 로비 복귀 경로로 이어지는지 확인한다"는 확인 결과 **버튼 자체가 없다**. 결과 페이지 컴포넌트는 수정 금지이므로 이번 작업에서 버튼을 신설하지 않는다. 대신 "로비 복귀"는 요구 3의 리다이렉트 가드가 담당한다(winResult가 사라지면 → 로비). 로비 경로는 기존 세션 종료 finalizer와 동일하게 **`/multiplay`** 를 쓴다(`createSessionEndFinalizer.js:14`가 이 저장소에서 "로비로 이동"이라 부르는 경로다 — 새 경로를 발명하지 않는다).

---

## 1. store: winResult 전체 보존

### 1-1. CREATE `frontend/src/domains/game/ingame/utils/normalizeWinResult.js`

세 파서가 지금 winResult 검증 블록을 **동일하게 3벌 중복**하고 있고(그 등가성을 `applySessionSnapshot.test.js:580`의 패리티 테스트가 지키고 있다), 여기에 reveals/mvp 정규화까지 3벌 더 복제하면 드리프트 위험이 커진다. 검증+정규화를 순수 함수 하나로 뽑고 세 파서가 같은 함수를 부른다 — 패리티 테스트는 그대로 통과하며 오히려 구조적으로 보장된다.

```
export function normalizeWinResult(raw)  // 유효하면 {winner, reveals, mvp}, 아니면 null
```

규칙:
- `raw`가 null/비객체/배열이거나 `winner`가 `"CITIZEN"|"JOKER"`가 아니면 **null**(기존 거부 조건과 정확히 동일 — accept/reject 집합 불변).
- `reveals`: 배열이 아니면 `[]`. 배열이면 원소마다 plain object일 때 `{uuid, nickname, role, team, alive}` 다섯 필드만 새 객체로 복사한다. 원소 중 하나라도 plain object가 아니면 **reveals 전체를 `[]`로** 만든다(부분만 신뢰한 명단은 잘못된 로스터를 그리므로 all-or-nothing).
- `mvp`: `raw.mvp`가 plain object면 얕은 복사, 그 외(없음/null/원시값)는 `null`.
- 매 호출마다 새 객체·새 배열을 반환한다(호출부가 응답 객체를 이후 변형해도 store가 오염되지 않는다는 기존 격리 계약 유지).

### 1-2. MODIFY `applySessionSnapshot.js` / `applyTribunalResolved.js` / `parseNightResultAppliedPayload.js`

각 파일의 `winResult = { winner: ... }` 한 줄과 그 위 인라인 검증 블록을 `normalizeWinResult` 호출로 치환한다. `Object.hasOwn(payload,'winResult')` 게이트(필드 자체가 없으면 거부)와 `phase==='ENDED'` 양방향 불변조건은 **각 파일에 그대로 남긴다** — 그건 winResult 값 검증이 아니라 payload 문맥 검증이라 파서마다 다르다.

- `applySessionSnapshot.js:175-189` → `if (!Object.hasOwn(response,'winResult')) return current; winResult = normalizeWinResult(response.winResult); if (winResult === null) return current;` (ENDED가 아닌데 winResult가 있으면 거부하는 else 분기는 유지)
- `applyTribunalResolved.js:41-50` → 동일 패턴, 실패 시 `return current`
- `parseNightResultAppliedPayload.js:30-39` → 동일 패턴, 실패 시 `return null`

`ingameStore.js`는 **건드리지 않는다**. `applyNightResultAppliedPayload`는 이미 파서가 정규화한 payload를 그대로 받아 `state.winResult`에 넣고(`ingameStore.js:152`), 나머지 두 경로는 pure 함수가 정규화한 state를 그대로 반영하므로, 프로덕션 세 경로 모두 정규화된 객체가 들어간다. 소비자인 `getInGameWinResultLabel`은 `winner`만 읽으므로(`ingameActionPanel.js:109`) 키가 늘어도 영향 없다.

### 1-3. MODIFY 기존 파서 테스트 3종

정규화로 출력 shape가 `{winner}` → `{winner, reveals, mvp}`가 되므로 `assert.deepEqual(..., {winner:"CITIZEN"})` 단정이 깨진다. 깨지는 지점은 정확히 다음뿐이다(전수 grep 확인):

- `store/__tests__/applySessionSnapshot.test.js:167`
- `store/__tests__/applyTribunalResolved.test.js:118, 139`
- `utils/__tests__/parseNightResultAppliedPayload.test.js:94, 99`

이 단정들을 새 shape로 갱신하고, 같은 파일에 요구된 신규 케이스를 추가한다:
- reveals 5명 + mvp가 그대로 보존된다(순서·필드 포함)
- `reveals: "not-an-array"` / 누락 / 원소가 문자열 → `[]`
- 반환된 reveals 배열/원소를 변형해도 원본 payload가 오염되지 않는다(격리) — `applySessionSnapshot.test.js:462`의 기존 격리 테스트에 reveals 항목을 덧붙인다
- `winResultFixtures` 패리티 테스트(`applySessionSnapshot.test.js:570`)에 `{winner:"CITIZEN", reveals:"nope"}` 같은 케이스를 추가해 **거부가 아니라 정규화**임을 3파서 모두에서 못 박는다

`store/__tests__/ingameStore.test.js`는 raw payload를 store 액션에 직접 넣는 테스트라 값이 그대로 통과한다 — 수정 불필요(실제로 line 128 단정은 유지된다).

---

## 2. CREATE `frontend/src/domains/game/result/utils/buildGameResultViewModel.js`

```
export function buildGameResultViewModel(winResult, selfUuid)
  → { outcome: "win"|"lose", players: [{id, name, job, portraitSrc}], mvp: player|null }
```

- 직업 한글 라벨은 **이 파일 안 상수 한 곳**에만 둔다:
  `{ JOKER:"광대", CITIZEN:"귀족", DOCTOR:"주치의", GUARD:"경비원", WITCH_HUNTER:"귀족" }`
  WITCH_HUNTER의 "귀족"은 임시값이라는 주석을 달아, 전용 에셋이 생기면 이 한 줄만 바꾸면 되게 한다. 인게임의 `ingameRoleRevealData.js`(시민/의사/경비대)와는 표시 어휘가 다르므로 **재사용하지 않는다**(결과 페이지 시안 어휘가 계약이다).
  알 수 없는 role은 `""`로 둔다 — 임의의 다른 직업명으로 채워 잘못된 정보를 보여주지 않는다.
- `players`: `reveals` 순서 그대로, `{ id: uuid, name: nickname, job: 라벨, portraitSrc: pickInGameJobPortrait(index) }`. 포트레이트는 preview와 동일하게 슬롯 index 순환 관례를 따른다(`gameResultPreviewData.js:19-22`).
- `outcome`: `reveals`에서 `uuid === selfUuid`인 원소를 찾아 `team === winResult.winner`면 `"win"`, 아니면 `"lose"`. 본인이 없거나 selfUuid가 null이면 `"lose"`.
- `mvp`: `winResult.mvp`가 null/비객체면 `null`. 객체이고 `uuid`가 players에 있으면 **그 player 객체 자체**(portraitSrc/job이 채워진)를 반환, 매칭 실패면 `null`. (backend는 현재 항상 null을 보낸다 — 슬롯만 예약된 상태다.)
- 총함수(total)로 만든다: winResult가 비정상이어도 throw하지 않고 `{outcome:"lose", players:[], mvp:null}`을 돌려준다. "결과가 없으니 로비로"라는 판단은 훅이 하고, 이 순수 함수는 판단하지 않는다.

### CREATE `frontend/src/domains/game/result/utils/__tests__/buildGameResultViewModel.test.js`
요구된 커버리지 전부:
JOKER 승 × (본인 JOKER / CITIZEN / DOCTOR / GUARD / WITCH_HUNTER) → outcome, CITIZEN 승 × 동일 5종 → outcome, job 한글 매핑 5종, players 순서·id·name 일치, portraitSrc가 `pickInGameJobPortrait(index)`와 동일, reveals 누락/빈 배열, 본인이 reveals에 없음 → `"lose"`, selfUuid null → `"lose"`, mvp null → null.

---

## 3. CREATE `frontend/src/domains/game/result/hooks/useGameResultData.js` + 페이지 배선

```
export function useGameResultData() {
  const winResult = useInGameStore((s) => s.state?.winResult ?? null)
  const selfUuid  = useInGameStore((s) => s.state?.self?.uuid ?? null)
  return useMemo(() => (winResult ? buildGameResultViewModel(winResult, selfUuid) : null), [winResult, selfUuid])
}
```
`useGameResultPreview.js`와 `gameResultPreviewData.js`는 **손대지 않는다**(개발용 `?outcome=` 진입 유지).

### MODIFY `frontend/src/domains/game/result/page/GameResultPage.jsx`
```
const live = useGameResultData()                       // 훅은 항상 무조건 호출(순서 고정)
const preview = useGameResultPreview()
const previewRequested = GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
const view = live ?? (previewRequested ? preview : null)
useEffect(() => { if (!view) navigate("/multiplay", { replace: true }) }, [view, navigate])
if (!view) return null
return <GameResultShell {...view} />
```
`GAME_RESULT_OUTCOMES`는 기존 `gameResultPreviewData.js`에서 읽는다(그 파일은 수정하지 않는다).

### CREATE `frontend/src/domains/game/result/hooks/__tests__/useGameResultData.test.js`
`renderHook` + `useInGameStore.setState`로: winResult 없음 → `null`, ENDED winResult 있음 → view model(본인 팀 기준 outcome, players 길이/순서), winResult 참조가 그대로면 결과 참조도 그대로(useMemo 안정성).

### CREATE `frontend/src/domains/game/result/page/__tests__/GameResultPage.productionSource.test.js`
`.jsx`라 렌더 불가 → `InGamePage.productionSource.test.js` 관례대로 raw source 단정: `useGameResultData` 우선 사용, `useGameResultPreview`가 `?outcome=` 게이트 뒤에만 쓰임, `navigate("/multiplay", { replace: true })` 폴백 존재, `GameResultShell` 마운트 1회.

---

## 4. ENDED 전이: killReveal 큐가 다 빈 뒤 결과 페이지로

### 4-1. MODIFY `useInGameKillReveal.js` — 반환값에 `pending` 추가 (가산 only)
현재 훅은 `open`만 노출한다. `consumeInGameKillReveal`이 다음 항목을 같은 setState에서 즉시 승격하므로 정상 흐름에서는 `open`만으로 충분하지만, **`hold`(내 역할 보기 재열람)가 걸린 순간에는 active=null인데 queue에 항목이 남아** `open===false`가 된다(`reduceInGameKillReveal.js:70-73`). 이 상태에서 navigate하면 사망 연출이 통째로 유실된다 — 요구 4가 말하는 "큐 남아있으면 대기"가 정확히 이 케이스다.

따라서 반환 객체에 `pending: presentation.queue.length > 0` 한 줄만 더한다. **재생 로직(reduce/consume/오버레이 컴포넌트)은 일절 건드리지 않는다** — 이미 있는 상태에서 파생 읽기만 노출하는 변경이다. `useInGameOverlayStack`은 killReveal 객체를 통째로 그대로 되돌려주므로(`useInGameOverlayStack.js:48`) 수정할 필요가 없다. 기존 `useInGameKillReveal.test.js`는 반환 객체를 deep-equal하지 않으므로(개별 필드만 단정) 깨지지 않는다.

### 4-2. CREATE `frontend/src/domains/game/ingame/hooks/useInGameResultNavigation.js`
```
export function useInGameResultNavigation({ hold = false } = {}) {
  // phase === "ENDED" && winResult 존재 && !hold 일 때 한 번만 navigate("/gameresult", { replace: true })
}
```
- `winResult` 존재를 함께 요구한다 — winResult 없이 이동하면 결과 페이지가 즉시 로비로 튕겨 나간다.
- `useRef` 1회 가드로 StrictMode 이중 effect·리렌더에서 중복 navigate를 막는다.
- `replace: true`를 쓴다 — 뒤로가기로 종료된 인게임 화면에 되돌아가지 않게 한다(`useInGameExit`의 POP 차단 계약과 충돌하지 않는다: 그 훅은 /ingame에서만 마운트된다).
- **store를 전혀 변경하지 않는다.** `clearGame()`을 호출하지 않으므로 winResult가 결과 페이지까지 유지된다(요구 4).

### 4-3. MODIFY `frontend/src/domains/game/ingame/pages/InGamePage.jsx`
`useInGameOverlayStack()` 호출 바로 뒤에 한 줄:
```
useInGameResultNavigation({ hold: killReveal.open || killReveal.pending })
```
다른 배선(오버레이·requestExit·isValidGameSession 가드)은 그대로 둔다. 훅은 조기 return(`:55`)보다 위에 있어 호출 순서가 항상 고정된다.

### 4-4. CREATE `.../hooks/__tests__/useInGameResultNavigation.test.js`
`useGameSessionSocketEvents.nightTurn.test.js`의 JSDOM 설치 + `mock.module("react-router-dom", { namedExports: { useNavigate: () => fakeNavigate } })` 관례를 그대로 따른다:
- phase ENDED + winResult 있음 + hold=false → `navigate("/gameresult", {replace:true})` 1회
- 동일 조건 + hold=true → navigate 호출 0회, hold가 false로 풀리면 그때 1회
- phase가 DAY/TRIBUNAL → 0회
- phase ENDED인데 winResult 없음 → 0회
- 리렌더 반복해도 1회

### 4-5. MODIFY `.../pages/__tests__/InGamePage.productionSource.test.js`
기존 파일에 raw source 단정 2개를 덧붙인다: `useInGameResultNavigation`이 정확히 한 번 호출되고, 그 인자가 `killReveal.open || killReveal.pending`을 hold로 넘긴다. (기존 5개 테스트는 그대로 통과한다 — 이 파일의 단정은 모두 지금 손대지 않는 영역이다.)

---

## 5. 검증

```
cd frontend
npm test          # node:test 전체 — 신규/수정 테스트 포함 전 파일 PASS
npm run build     # vite build PASS
npm run lint
npm run check:utf8
```
backend는 수정하지 않으므로 backend 테스트는 회귀 대상이 아니지만, 계약을 읽기만 했음을 보이기 위해 `cd backend && npm test`도 한 번 돌려 무변화를 확인한다.

수동 확인(선택, 서버 기동 시): 게임을 ENDED까지 몰고 가 사망 연출이 끝난 뒤 `/gameresult`로 이동하는지, 본인 역할 기준 승/패 배너와 전원 정체 목록이 뜨는지, `/gameresult?outcome=win`로 직접 들어가면 여전히 preview가 뜨는지.

---

## 6. 위험 요소

| 위험 | 판단 |
| --- | --- |
| 기존 파서 테스트 5개 단정이 깨진다 | 예상된 계약 변경. 해당 3개 테스트 파일을 MODIFY 대상에 명시했다. 그 밖에 winResult를 deep-equal하는 곳은 전수 grep으로 없음을 확인했다. |
| `useInGameKillReveal` 수정이 "killReveal 영상 재생 로직 수정 금지"에 걸리나 | 걸리지 않도록 **반환 객체에 파생 필드 1개 추가**만 한다. reduce/consume/오버레이 컴포넌트·타이밍은 무변경. 대안(overlayStack에서 큐를 다시 계산)은 큐 상태에 접근할 수 없어 불가능하다. |
| 결과 페이지 체류 중 다른 참가자가 이탈 → `game_ended` → `clearGame()` + `/multiplay` 강제 이동 | **기존 계약**이다(`finalizeGameSessionEnd` → `createGameEndedHandler`). 이번 범위에서 바꾸지 않는다. 이 경우 결과 페이지의 winResult가 사라지고 리다이렉트 가드가 같은 `/multiplay`로 보내므로 동작이 일관된다. 요구 4의 "세션 정리 경로를 깨지 않는다"에 부합. |
| ENDED 직후 인게임 컨트롤 패널의 승리 배지가 거의 안 보인다 | navigate가 즉시 일어나므로 의도된 결과. 배지 로직은 손대지 않는다. |
| `mvp`가 항상 null이라 MVP 패널이 렌더되지 않는다 | backend가 `mvp:null`을 보내는 현 상태의 정상 동작(`buildTerminalFields`의 "MVP 기획 미확정 — 슬롯만 예약"). 패널은 `!mvp`에서 null을 반환하므로 레이아웃 깨짐 없음. |
| 새로고침으로 store가 빈 채 `/gameresult` 직접 진입 | 리다이렉트 가드가 `/multiplay`로 보낸다(InGamePage의 동일 가드와 같은 관례). 서버는 재접속 시 ENDED 스냅샷을 줄 수 있지만, 결과 페이지는 스냅샷 sync 훅을 마운트하지 않으므로 이번 범위 밖이다. |
| 새 테스트 디렉터리(`result/utils/__tests__` 등)가 test glob에 안 잡힘 | `src/**/__tests__/*.test.js`가 임의 깊이를 커버하며 기존 테스트도 5~6단계 깊이에 있다. |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| CREATE | frontend/src/domains/game/ingame/utils/normalizeWinResult.js |  | winResult 검증+정규화 순수 함수(reveals 비배열→[], mvp 기본 null) |
| CREATE | frontend/src/domains/game/result/utils/buildGameResultViewModel.js |  | winResult+selfUuid → 결과 페이지 계약 shape, 직업 한글 매핑 단일 지점 |
| CREATE | frontend/src/domains/game/result/utils/__tests__/buildGameResultViewModel.test.js |  | outcome 승/패 × 역할 5종, job 매핑, reveals 누락·본인 미포함 |
| CREATE | frontend/src/domains/game/result/hooks/useGameResultData.js |  | store winResult·selfUuid → view model, 없으면 null |
| CREATE | frontend/src/domains/game/result/hooks/__tests__/useGameResultData.test.js |  | null 반환·실데이터 조립·memo 안정성 |
| CREATE | frontend/src/domains/game/result/page/__tests__/GameResultPage.productionSource.test.js |  | 실데이터 우선·preview 게이트·로비 폴백 배선 검증 |
| CREATE | frontend/src/domains/game/ingame/hooks/useInGameResultNavigation.js |  | ENDED+winResult+큐 비었을 때 /gameresult로 1회 navigate |
| CREATE | frontend/src/domains/game/ingame/hooks/__tests__/useInGameResultNavigation.test.js |  | 전이 호출·hold 대기·비ENDED 무동작 |
| MODIFY | frontend/src/domains/game/ingame/store/applySessionSnapshot.js | applySessionSnapshotPure | 스냅샷 winResult를 normalizeWinResult로 전체 보존 |
| MODIFY | frontend/src/domains/game/ingame/store/applyTribunalResolved.js | applyTribunalResolvedPure | 재판 종료 winResult를 normalizeWinResult로 전체 보존 |
| MODIFY | frontend/src/domains/game/ingame/utils/parseNightResultAppliedPayload.js | parseNightResultAppliedPayload | 밤 종료 winResult를 normalizeWinResult로 전체 보존 |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameKillReveal.js | useInGameKillReveal | 반환값에 pending(대기 큐 잔량) 추가 — 재생 로직 무변경 |
| MODIFY | frontend/src/domains/game/ingame/pages/InGamePage.jsx |  | useInGameResultNavigation 배선(hold = open \|\| pending) |
| MODIFY | frontend/src/domains/game/result/page/GameResultPage.jsx |  | 실데이터/preview 선택과 로비 리다이렉트 |
| MODIFY | frontend/src/domains/game/ingame/store/__tests__/applySessionSnapshot.test.js |  | 새 winResult shape 단정 갱신·reveals 보존/정규화/격리 |
| MODIFY | frontend/src/domains/game/ingame/store/__tests__/applyTribunalResolved.test.js |  | 새 winResult shape 단정 갱신·reveals 보존/정규화 |
| MODIFY | frontend/src/domains/game/ingame/utils/__tests__/parseNightResultAppliedPayload.test.js |  | 새 winResult shape 단정 갱신·reveals 보존/정규화 |
| MODIFY | frontend/src/domains/game/ingame/pages/__tests__/InGamePage.productionSource.test.js |  | 결과 페이지 전이 훅 배선 raw source 단정 추가 |
| REFERENCE | frontend/src/domains/game/result/components/GameResultMvpPanel.jsx |  | mvp null 처리 확인(수정 금지) |
| REFERENCE | frontend/src/domains/game/result/components/GameResultShell.jsx |  | 소비 prop 계약(outcome/players/mvp) |
| REFERENCE | frontend/src/domains/game/result/constants/gameResultPreviewData.js |  | GAME_RESULT_OUTCOMES·포트레이트 관례(유지) |
| REFERENCE | frontend/src/domains/game/result/hooks/useGameResultPreview.js |  | 개발용 preview 훅(삭제 금지) |
| REFERENCE | frontend/src/domains/game/ingame/utils/pickInGameJobPortrait.js |  | portraitSrc 생성 관례 |
| REFERENCE | frontend/src/domains/game/ingame/store/ingameStore.js |  | winResult 저장 경로·selfUuid 위치 |
| REFERENCE | frontend/src/domains/game/ingame/utils/reduceInGameKillReveal.js |  | queue/active 상태 기계(pending 파생 근거) |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameOverlayStack.js |  | killReveal 객체 통과 경로 |
| REFERENCE | frontend/src/domains/game/ingame/utils/createSessionEndFinalizer.js |  | 기존 로비 복귀 경로(/multiplay) |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useGameSessionSocketEvents.js |  | game_ended·파서 호출부 계약 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/__tests__/useGameSessionSocketEvents.nightTurn.test.js |  | JSDOM·react-router-dom 모킹 테스트 관례 |
| REFERENCE | backend/game-core/gameSession.js |  | winResult{winner,reveals,mvp} 계약(수정 금지) |
