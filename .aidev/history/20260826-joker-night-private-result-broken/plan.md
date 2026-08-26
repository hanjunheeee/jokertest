# 밤 개인 조사 결과 오버레이 미표시 — 원인 특정 및 수정 계획

## 1. 진단 결과 — 원인은 frontend 한 곳이다

**원인: `frontend/src/domains/game/ingame/hooks/useInGameResolveNight.js` → `useInGameResolveNight`의 `handleResult` (파일 96–106행), 정확히는 102행의 stale 판정식.**

```js
// useInGameResolveNight.js:102
if (appliedNightDayIndexRef.current !== null && payload.dayIndex <= appliedNightDayIndexRef.current) return
```

`appliedNightDayIndexRef`는 이름과 달리 **밤의 dayIndex가 아니라 그 밤이 적용된 뒤 진입한 DAY의 dayIndex**(=밤의 dayIndex + 1)를 담는다. 116행에서 `night_result_applied.dayIndex`를 그대로 대입하기 때문이다.

canonical dayIndex 진행을 코드로 확인하면:

| 시점 | 근거 | dayIndex |
| --- | --- | --- |
| DAY N | — | N |
| DAY N → NIGHT | `commitDayVoteResolution` (`backend/game-core/gameSession.js:1607-1608`)·TRIBUNAL 경로 모두 `phase`만 바꾼다 | N (그대로) |
| 그 밤의 `night_action_result.dayIndex` | `prepareNightResolution` (`backend/game-core/gameSession.js:1258`) = commit 전 `session.dayIndex` | **N** |
| 그 밤의 `night_result_applied.dayIndex` | `enterDayPhase`의 `session.dayIndex += 1` (`backend/game-core/gameSession.js:803`) 이후 `buildNightResultAppliedPayload:1383` | **N+1** |

따라서 N번째 밤이 끝나면 `appliedNightDayIndexRef.current === N+1`이 되고, **다음 밤(N+1번째 밤)의 개인 결과는 `dayIndex === N+1`이라 `<=` 조건에 그대로 걸려 store에 들어가기도 전에 버려진다.** 즉

- 첫 밤(ref === null)만 통과하고,
- **둘째 밤부터는 GUARD의 INVESTIGATE도 WITCH_HUNTER의 CONFIRM도 예외 없이 폐기된다.**

WITCH_HUNTER는 새 규칙상 "그 밤에 시신이 있어야" 턴이 열려(`e2e/lib/scenarioPlan.js:147`의 판정 근거와 `isEligibleForNightAction`) 실질적으로 둘째 밤 이후에 처음 행동하는 경우가 많고, GUARD는 매 밤 행동하므로 둘째 밤부터 조용히 사라진다 — 요구서가 말한 "둘 다 안 뜨는 공통 지점"이 바로 이 한 줄이다. 이 값은 `[gameId]` effect(75–79행)에서만 null로 되돌아가므로 같은 게임이 이어지는 한 회복되지 않는다.

기존 테스트가 이걸 못 잡은 이유도 확인했다: `useInGameOverlayStack.nightPrivateResult.test.js`의 모든 시나리오가 **첫 밤 하나만**(개인 결과 `dayIndex: 1` → 적용 `dayIndex: 2`) 재생한다(175–204행). 둘째 밤을 재생하는 케이스가 프런트에 단 하나도 없다.

## 2. 원인이 아님을 코드로 확인한 구간 (수정하지 않는다)

- **backend/socket `handleResolveNight`** (`backend/socket/gameSession.js:862-890`): 수신자 루프에서 `prepared.resolution.privateResults.get(recipientUuid)`가 있을 때만 그 소켓에 `night_action_result`를 emit한다. 대상 격리·emit 순서(`night_actions_resolved` → `night_action_result` → `night_result_applied`) 모두 정상. `handleSubmitNightAction`의 자동 판정 경로(`:358-367`)도 같은 핸들러를 그대로 재사용하므로 경로가 하나뿐이다.
- **backend/game-core `prepareNightResolution`** (`:1242-1251`)·`commitNightResolution`(`:1330-1367`): privateResults는 uuid 키로 정상 적재되고 commit이 이 Map을 건드리지 않는다. `nightTurnProgression.test.js:384-397`이 이미 "WH 본인에게만 1건" 을 통과시키고 있다.
- **frontend store** `setNightPrivateResult`/`applyNightResultAppliedPayload`/`withNightReentryClear` (`ingameStore.js:19-25, 73-89, 124-168`): DAY 전이는 개인 결과를 지우지 않고, clear 지점은 확인·NIGHT 재진입·gameId 변경 셋뿐이다.
- **오버레이 표시 조건** `useInGameNightPrivateResult` / `useInGameOverlayStack`(`:33-39`) / `InGamePage.jsx:125-130`: killReveal 뒤·phaseEntrance 앞 순서 규칙이 hold 전달로 정상 배선돼 있고, `reduceInGameNightPrivateResult`는 CONFIRM(`role`)·INVESTIGATE(`team`) 둘 다 처리한다.

→ **backend는 손대지 않는다.** 요구서의 "밤 판정·사망 처리 로직"도 그대로 둔다.

## 3. 수정 내용

### 3-1. `frontend/src/domains/game/ingame/hooks/useInGameResolveNight.js` (MODIFY, symbol `useInGameResolveNight`)

ref가 담는 값의 의미를 이름과 일치시켜 off-by-one을 구조적으로 없앤다. 세 지점만 바뀌고 함수 밖으로 나가는 영향은 없다(ref는 이 훅 로컬).

1. **ref 선언(32–36행)**: `appliedNightDayIndexRef` → `resolvedNightDayIndexRef`로 이름을 바꾸고, 주석을 "이미 판정이 적용된 **밤**의 dayIndex(= `night_result_applied.dayIndex - 1`). null이면 아직 적용된 밤이 없다"로 정정한다. 왜 DAY 값을 그대로 담으면 안 되는지(다음 밤의 개인 결과 dayIndex와 같아진다)를 한 줄로 남긴다.
2. **`handleResult`(102행)**: 판정식을 `payload.dayIndex <= resolvedNightDayIndexRef.current`로 유지하되 **ref가 밤 기준 값이 된 뒤의 비교**가 되게 한다. 결과적으로
   - N번째 밤 종료 후 ref = N → N+1번째 밤 개인 결과(`dayIndex === N+1`)는 통과 ✅
   - 이미 적용된 N번째 밤의 늦은/중복 개인 결과(`dayIndex === N`)는 그대로 폐기 ✅ (stale 방어의 원래 목적은 보존)
3. **`handleApplied`(112–118행)**: `const resolvedNightDayIndex = payload.dayIndex - 1`을 만들고, 단조 검사와 ref 갱신을 둘 다 이 값으로 바꾼다.
   ```js
   if (payload.phase !== "DAY" || !Number.isInteger(payload.dayIndex)) return
   const resolvedNightDayIndex = payload.dayIndex - 1
   if (resolvedNightDayIndexRef.current !== null && resolvedNightDayIndex <= resolvedNightDayIndexRef.current) return
   resolvedNightDayIndexRef.current = resolvedNightDayIndex
   invalidate()
   ```
   같은 밤의 중복 `night_result_applied`는 지금과 똑같이 no-op이고(값이 −1씩 평행이동될 뿐), 새 밤만 `invalidate()`를 부른다 — 기존 동작은 하나도 바뀌지 않는다.
4. **`[gameId]` effect(75–79행)**: 이름만 새 ref로 바꾼다(초기화 의미 동일).

파일 상단 주석(17–20행)의 계약 설명은 그대로 유효하므로 손대지 않는다.

### 3-2. `frontend/src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.nightPrivateResult.test.js` (MODIFY, 파일 단위)

기존 7개 테스트는 그대로 두고, 헬퍼를 dayIndex 파라미터화한 뒤 **둘째 밤 회귀 테스트**를 추가한다(수신 → store → 오버레이 표시 조건까지 실제 배선으로).

- `applyCanonicalNightResult({ dayIndex = 2 } = {})`로 기본값을 둔 채 파라미터화(기존 호출부 무변경). `firePrivateResult`/`fireNightResultApplied`는 이미 overrides를 받으므로 그대로 쓴다.
- 둘째 밤으로 넘어가는 canonical 전이는 `applyDayVoteResolvedToPhase(GAME_ID, 2, { outcome: "ABSTAINED" })`로 만든다(DAY 2 → NIGHT dayIndex 2, `withNightReentryClear` 경유 — 프로덕션과 같은 경로).
- 추가 케이스:
  1. **GUARD 둘째 밤**: 첫 밤 결과를 정상 표시·확인해 소비 → NIGHT(dayIndex 2) → `night_action_result{dayIndex:2, INVESTIGATE, team:"JOKER"}` → `night_result_applied{dayIndex:3}` → `store.nightPrivateResult !== null`, `stack.nightPrivateResult.open === true`, label `"홍길동 님은 광대 진영입니다"`.
  2. **WITCH_HUNTER 둘째 밤(새 규칙)**: 같은 흐름에서 `{dayIndex:2, actionType:"CONFIRM", role:"DOCTOR"}` → `kind === "CONFIRM"`, label `"홍길동 님의 역할은 의사입니다"`, 그리고 **killReveal 소비 뒤에 열리고 phaseEntrance는 그 뒤로 밀린다**는 순서 규칙까지 함께 단언(`phaseEntrance.open === false` → confirm 후 `true`).
  3. **stale 방어가 여전히 산다**: 첫 밤이 적용된 뒤(ref=1) 도착한 `dayIndex:1` 개인 결과는 계속 폐기되어 `store.nightPrivateResult === null`.

### 3-3. `backend/socket/__tests__/nightTurnProgression.test.js` (MODIFY, 파일 단위)

backend는 고치지 않지만 요구서 검증 ①(판정 후 개인 결과가 해당 uuid 소켓으로만 전송·비밀 격리)을 **GUARD·WH 동시**·**제2일 밤** 기준으로 못 박는 테스트를 추가한다. 이 파일에 이미 `makeCustomRoom`/`ackAllAndRewindToNight({dayIndex})`/`wireSockets`/`submit` 헬퍼가 있어 새 헬퍼 없이 조립된다.

- 5인(JOKER/DOCTOR/GUARD/WITCH_HUNTER/CITIZEN), `ackAllAndRewindToNight(session, { dayIndex: 2 })`, CITIZEN을 시신으로 두어 WH 턴을 연다.
- 제출: JOKER SKIP → DOCTOR 자기 보호 → GUARD가 JOKER 지목 → WH가 시신(CITIZEN) 지목(마지막 제출이 자동 판정을 트리거).
- 단언:
  - `session.phase === 'DAY'`, `session.dayIndex === 3`
  - GUARD 소켓: `night_action_result` 정확히 1건, payload `{gameId, dayIndex: 2, actionType:'INVESTIGATE', targetId: jokerUuid, team:'JOKER'}` — **dayIndex가 판정된 밤의 값(2)이며 DAY 전이 값(3)이 아니라는 점**을 명시적으로 단언한다(프런트 stale 판정식이 기대는 계약이다).
  - WH 소켓: 1건, `{gameId, dayIndex: 2, actionType:'CONFIRM', targetId: citizenUuid, role:'CITIZEN'}`
  - JOKER·DOCTOR·CITIZEN 소켓: `night_action_result` 0건 (비밀 격리)
  - 전원 `night_actions_resolved`·`night_result_applied` 각 1건

## 4. 검증

| # | 명령 | 기대 |
| --- | --- | --- |
| 1 | `node --test backend/socket/__tests__/nightTurnProgression.test.js` | 신규 제2일 밤 개인 결과 격리 테스트 포함 PASS |
| 2 | `npm run test:game-core` (`backend/game-core/__tests__/*.test.js`) | 무변경, 기존 전부 PASS |
| 3 | `node --test backend/socket/__tests__/*.test.js` | backend socket 전체 PASS |
| 4 | `npm test --prefix frontend` | 신규 둘째 밤 케이스 포함 frontend 전체 PASS |

수동 확인 시나리오(참고): 5인 → DAY1 투표 → NIGHT1(GUARD 조사) → 결과 오버레이 확인 → DAY2 → NIGHT2(GUARD 조사 + 시신 있으면 WH 확인) → **둘째 밤에도 사망 연출 뒤·"낮이 되었습니다" 앞에 개인 결과가 뜬다**.

## 5. 리스크와 대응

| 리스크 | 대응 |
| --- | --- |
| ref 의미 변경으로 `handleApplied`의 중복 방송 무시가 깨짐 | 값이 −1 평행이동될 뿐 비교 구조가 같다. 첫 밤(ref null) → 같은 밤 재방송 no-op → 다음 밤만 갱신을 테스트로 고정한다 |
| `payload.dayIndex - 1`이 비정수/음수 | `Number.isInteger(payload.dayIndex)` 검사를 뺄셈보다 먼저 유지한다. 첫 밤 적용은 항상 dayIndex ≥ 2이므로 음수는 나오지 않고, 설령 0이 와도 ref=−1은 이후 비교에서 안전하다 |
| ENDED로 끝난 밤은 ref가 갱신되지 않음 | `handleApplied`는 지금도 `phase !== "DAY"`를 거른다(114행). 게임이 끝난 뒤라 다음 밤이 없어 무해 — 기존 동작 유지 |
| 프런트 테스트가 `applyDayVoteResolvedToPhase`로 NIGHT 재진입 시 개인 결과를 지움 | 의도된 clear 지점이다. 둘째 밤 결과는 **재진입 이후에** 발화시켜 그 규칙과 충돌하지 않게 순서를 잡는다 |
| e2e 라벨 계약 | 라벨 빌더(`reduceInGameNightPrivateResult`)·DOM 속성(`data-ingame-night-private-result`)을 건드리지 않으므로 `e2e/lib/scenarioPlan.js:410` 등 기존 셀렉터는 그대로 유효하다. `e2e/**`는 수정하지 않는다 |
| 이전 slice처럼 `node_modules` 미설치로 frontend suite 실행 불가 | 실행 불가 시 PASS로 적지 않고 실패로 보고한다(과거 `20260826-joker-e2e-wh-scenario/failure.md` 선례) |

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | frontend/src/domains/game/ingame/hooks/useInGameResolveNight.js | useInGameResolveNight | 개인 결과 stale 판정 기준을 "적용된 밤의 dayIndex"로 바로잡아 둘째 밤부터의 폐기를 없앤다 |
| MODIFY | frontend/src/domains/game/ingame/hooks/__tests__/useInGameOverlayStack.nightPrivateResult.test.js |  | 둘째 밤 GUARD·WITCH_HUNTER 수신→store→오버레이 표시·순서 회귀 테스트 추가 |
| MODIFY | backend/socket/__tests__/nightTurnProgression.test.js |  | 제2일 밤 개인 결과가 GUARD·WH 각 uuid 소켓에만 가고 dayIndex가 밤 값임을 고정 |
| REFERENCE | backend/socket/gameSession.js | handleResolveNight | 개인 결과 emit 경로(정상 확인 — 수정 없음) |
| REFERENCE | backend/game-core/gameSession.js |  | dayIndex 진행 규칙(enterDayPhase)·privateResults 적재 근거 |
| REFERENCE | frontend/src/domains/game/ingame/store/ingameStore.js |  | nightPrivateResult 보관·clear 시점 계약 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameNightPrivateResult.js | useInGameNightPrivateResult | 오버레이 표시 조건(hold·display) |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameOverlayStack.js | useInGameOverlayStack | killReveal 뒤·phaseEntrance 앞 순서 규칙 |
| REFERENCE | frontend/src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js | reduceInGameNightPrivateResult | INVESTIGATE/CONFIRM 라벨 조립(무변경 — e2e 계약 유지) |
