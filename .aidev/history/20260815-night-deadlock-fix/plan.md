# 밤 페이즈 사망자 교착 버그 수정 — 구현 계획

## 0. 현재 코드 재검증 결과 (요구사항 "plan에서 다시 검증할 것"에 대한 답)

가드 slice 이후에도 **버그는 그대로 남아 있다.** 실제 코드에서 확인한 사실:

| 지점 | 현재 코드 | 문제 |
|---|---|---|
| `backend/game-core/gameSession.js:713` `getEligibleNightActorUuids` | `isEligibleForNightAction(player.role, session.dayIndex)`만 검사, **`player.alive` 미검사** | 사망한 행동 보유자가 "제출해야 할 사람"에 그대로 남는다 |
| `gameSession.js:882-884` `prepareNightResolution` | 위 목록 전원이 `nightActions.has()`여야 통과 | 사망자가 제출 안 하면 영구 `ACTIONS_PENDING` → **교착** |
| `gameSession.js:809` `submitNightAction` | `actor.alive` 검사가 **아예 없음** | 사망자가 제출 가능(그래서 오늘은 "사망자가 협조하면 풀리는" 반쪽 교착이다) |
| `gameSession.js:831-833` `submitNightAction` 대상 검증 | 참가자 존재만 검사, `alive` 미검사 | JOKER가 시체를 지목 → `commitNightResolution:1002`가 `victim이 이미 사망 상태`로 **throw** → `handleResolveNight`이 INTERNAL_ERROR ACK → **두 번째 교착** |
| `gameSession.js:724/751/900` 집계·개인결과 | 사망 여부 무시 | 죽은 JOKER의 표가 암살 집계에, 죽은 DOCTOR의 보호가 판정에 반영. 죽은 GUARD가 `night_action_result`를 계속 받음 |
| `frontend/.../useInGameActionPanel.js:232` `nightActionsLocked` | `interactionBlocked \|\| isGameEnded \|\| resolveNight중 \|\| phase!=='NIGHT'` — **생존 검사 없음** | 바로 아래 `dayVoteControlsEnabled:226`은 `isSessionPlayerAlive(localSessionPlayer)`를 검사한다. 밤만 누락 → 사망자에게 제출/건너뛰기 버튼이 활성 상태로 남음 |

대조군: DAY 경로는 이미 올바르다 — `getEligibleDayVoterUuids:1104`(생존 필터), `submitDayVote:1088`(`ACTOR_NOT_ALIVE`), `:1093`(`TARGET_NOT_ALIVE`), `prepareDayVoteResolution:1211-1219`(eligible voter의 표만, 대상 생존까지 검증). **이 slice는 NIGHT를 DAY와 같은 모양으로 맞추는 작업이다.** 새 개념을 만들지 않는다.

### 재현 경로 (밤 시작 전 사망)
8인 세션(JOKER 1 / DOCTOR 1 / GUARD 1 / CITIZEN 5) → DAY 투표 → TRIBUNAL → DOCTOR 유죄 처형(`commitTribunalVoteResolution:1531`이 `alive=false`) → 승리 조건 미충족 → `phase='NIGHT'`, `nightActions=new Map()` → 그 밤의 `getEligibleNightActorUuids`는 여전히 `[JOKER, DOCTOR(사망), GUARD]` → 죽은 DOCTOR가 제출하지 않으면 `resolve_night`은 영원히 `ACTIONS_PENDING`.

### 요구 동작 3 — "밤 도중 사망"에 대한 답: **구조적으로 불가능하다**
`gameSession.js` 전체에서 `alive`를 false로 바꾸는 지점은 정확히 두 곳뿐이다(grep 확인):
- `commitNightResolution:1012` — 직후 `finalizeGameSession`(ENDED) 또는 `enterDayPhase`(DAY)로 **반드시 NIGHT를 벗어난다**.
- `commitTribunalVoteResolution:1531` — `phase === 'TRIBUNAL'`을 재검증한 뒤에만 실행된다.

`endGameSessionForPlayer`는 세션 자체를 registry에서 지울 뿐 사망 표시를 하지 않는다. 따라서 **phase가 NIGHT인 동안 생존 집합은 절대 변하지 않는다.** 밤은 "고정된 생존 집합" 위에서 시작해 그 집합 위에서 판정된다. 이 사실을 코드 주석과 전용 테스트(§3 T7)로 못 박고, "밤 도중 사망" 전용 처리는 만들지 않는다(만들면 도달 불가능한 죽은 코드가 된다).

### 명확히 할 규칙 — "모든 행동 보유자가 사망한 밤: 즉시 판정으로 넘어가는가?"
**기존 코드에 이미 정해진 동작이 있다. 그대로 따른다: 즉시 판정된다.**
`prepareNightResolution:882`의 pending 검사는 eligible 목록을 순회하는 for 루프라, 목록이 비면 공회전하고 그대로 통과한다 → 암살 대상 없음 → 희생자 없는 밤 → `enterDayPhase`. 수정 후 이 동작이 **처음으로 실제 도달 가능해진다**(지금은 사망자가 목록에 남아 막고 있으므로).

덧붙여 확인한 도달성 분석(테스트로 고정할 것):
- **JOKER가 1명이라도 있는 세션에서는 이 상태에 도달할 수 없다.** JOKER의 `nightActionMinDayIndex`는 0이므로 생존 JOKER는 언제나 eligible이고, 마지막 JOKER가 죽는 순간 `evaluateWinCondition`이 시민 승리를 확정해 세션이 ENDED가 된다(NIGHT에 진입하지 못한다).
- 도달 가능한 경우는 `jokerCount: 0`인 AUTO 세션(game-core는 `jokerCount: 0`을 거부하지 않는다 — `validateSessionInput:337`)처럼 애초에 행동 보유자가 없는 구성뿐이다. 이때 `prepareNightResolution`은 즉시 성공하고, `commitNightResolution`의 승리 판정이 곧바로 시민 승리로 세션을 끝낸다.

**결론: 새 규칙을 도입하지 않는다. 서버 측 자동 판정 타이머도 추가하지 않는다** — 이 저장소의 세 판정(`resolve_night` / `resolve_day_vote` / `resolve_tribunal_vote`)은 전부 클라이언트가 트리거하는 구조이고, 자동 트리거는 이 slice 범위 밖의 새 메커니즘이다.

---

## 1. 변경 파일 요약

| 파일 | 성격 |
|---|---|
| `backend/game-core/gameSession.js` | 핵심 수정 (6개 지점) |
| `backend/game-core/__tests__/gameSession.test.js` | 신규 테스트 8건 |
| `backend/socket/__tests__/gameSession.test.js` | 신규 테스트 3건 + 픽스처 1개 |
| `frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js` | 1줄 게이트 추가 |
| `frontend/src/domains/game/ingame/components/actions/InGameActionPanel.jsx` | 기존 안내문 분기 조건 1줄 확장 |
| `frontend/src/domains/game/ingame/hooks/__tests__/useInGameActionPanel.test.js` | 신규 테스트 2건 |

`backend/socket/gameSession.js`는 **변경하지 않는다** — 새 코드 `ACTOR_NOT_ALIVE`/`TARGET_NOT_ALIVE`는 `INTERNAL_ONLY_CODES`(:8)에 없으므로 `handleSubmitNightAction:262`가 그대로 클라이언트에 전달한다(`submitDayVote`의 동일 코드가 이미 그 경로를 쓰고 있다). `TARGET_NOT_A_PARTICIPANT`는 이미 `RESOLVE_NIGHT_INTERNAL_ONLY_CODES`(:45)에 있다.

---

## 2. `backend/game-core/gameSession.js` 상세 변경

### C1. `getEligibleNightActorUuids` (:713) — 요구 동작 1의 단일 원천
```js
for (const player of session.players.values()) {
    if (player.alive !== true) continue          // ← 추가
    if (isEligibleForNightAction(player.role, session.dayIndex)) uuids.push(player.uuid)
}
```
주석 갱신: "생존한 행동 보유자"가 이 함수의 계약임을 명시하고, `getEligibleDayVoterUuids`(:1104)와 같은 원칙임을 적는다. `prepareNightResolution`의 완료 판정이 이 함수 하나만 쓰므로 요구 동작 1은 이 한 곳으로 만족된다.

### C2. `submitNightAction` — 사망자 제출 거부 (:822-829 구간)
`phase !== 'NIGHT'` → `nightResolution !== null` 검사 **다음**, `isEligibleForNightAction` **앞**에 삽입:
```js
if (!actor.alive) return { ok: false, code: 'ACTOR_NOT_ALIVE' }
```
- 순서 근거: `submitDayVote:1087-1088`과 동일한 "phase → actor 생존 → target" 순서. `NIGHT_ALREADY_RESOLVED`를 앞에 두는 기존 주석(:823-825)의 논리("판정 여부는 비밀이 아니다")가 생존 여부에도 그대로 적용된다 — 생존 상태는 `night_result_applied.players`와 스냅샷 `isAlive`로 이미 공개되므로 `NOT_ELIGIBLE`보다 먼저 반환해도 어떤 비밀도 새지 않는다.
- 사망한 CITIZEN은 `NOT_ELIGIBLE`이 아니라 `ACTOR_NOT_ALIVE`를 받게 된다(의도된 변화 — 역할이 아니라 생존이 더 근본적인 거부 사유).

### C3. `submitNightAction` — 사망한 대상 거부 (:831-833 구간)
`if (!targetPlayer) return INVALID_TARGET` **바로 다음**, JOKER 팀 no-op 분기 **앞**에 삽입:
```js
if (!targetPlayer.alive) return { ok: false, code: 'TARGET_NOT_ALIVE' }
```
- 이유: §0에서 확인한 두 번째 교착(시체 지목 → `commitNightResolution` throw → INTERNAL_ERROR → 그 밤이 판정 불가)을 원천 차단한다. `submitDayVote:1093`과 동일한 코드·동일한 위치.
- 부수 변화 명시: JOKER가 **사망한 동료 JOKER**를 지목하면 기존의 조용한 `{ok:true}` no-op 대신 `TARGET_NOT_ALIVE`가 반환된다. 생존 여부는 공개 정보이므로 진영 오라클이 되지 않는다(살아있는 동료에 대한 no-op 정책은 그대로 유지된다).

### C4. `prepareNightResolution` — 대상 재검증 범위 축소 + 생존 검사 (:886-890)
현재 `session.nightActions.values()` 전체를 훑는 루프를, `prepareDayVoteResolution:1211-1219`과 같은 모양으로 바꾼다:
```js
const eligibleActorUuids = getEligibleNightActorUuids(session)   // pending 검사와 같은 목록을 재사용
for (const actorUuid of eligibleActorUuids) {
    if (!session.nightActions.has(actorUuid)) return { ok: false, code: 'ACTIONS_PENDING' }
}
for (const actorUuid of eligibleActorUuids) {
    const target = session.nightActions.get(actorUuid)
    if (target === null) continue
    const targetPlayer = session.players.get(target)
    if (!targetPlayer || !targetPlayer.alive) return { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' }
}
```
- 두 루프 모두 같은 배열을 쓰도록 목록을 한 번만 계산한다(현재는 pending 루프가 매번 호출).
- 생존 검사 추가 근거: 이 값이 곧 `commitNightResolution`이 throw 조건으로 삼는 전제(`victim.alive === true`)다. prepare에서 걸러야 commit이 절대 throw하지 않는다는 이 파일의 계약이 유지된다.
- **회귀 확인 필요:** game-core 테스트에 `prepareNightResolution` 레벨의 `TARGET_NOT_A_PARTICIPANT` 테스트는 없다(socket 테스트 2361/2386은 `deps`로 가짜 resolution을 주입하므로 무관). 구현 시 grep으로 재확인하고, 만에 하나 "비-eligible 제출자의 엔트리"에 의존하는 테스트가 있으면 기존 전체 스캔 루프를 남긴 채 생존 검사만 덧붙이는 방식으로 후퇴한다.

### C5. 집계 함수 — 사망자 엔트리 무시 (방어적 이중화)
`tallyJokerAssassinationTarget:724`와 `computeDoctorProtectionSet:751`의 루프 상단에 `if (!player.alive) continue` 추가. C2가 이미 사망자 제출을 막지만, `tallyDayVoteOutcome`이 "eligible voter 목록만 순회"하는 것과 같은 이유로 집계 자체가 canonical 생존 상태에만 의존하게 만든다(수동 조립·오염 상태 방어).

### C6. `prepareNightResolution` privateResults 루프 (:900-908)
루프 상단에 `if (player.alive !== true) continue` 추가 — 사망한 GUARD/WITCH_HUNTER에게 `night_action_result`가 전달되지 않게 한다. 소켓 계층(`socket/gameSession.js:754`)은 `privateResults` Map을 그대로 소비하므로 여기서 빼면 방송 경로도 함께 정리된다.

### C7. 주석 정정 (`commitNightResolution:995-1003`)
현재 주석 "이번 슬라이스 범위(첫 밤, 재판정 없음)에선 모든 참가자가 아직 alive:true이므로 이 두 throw는 정상 경로에서 도달 불가능하다"는 이제 사실이 아니다(재판 처형·지난 밤 사망이 존재한다). 다음으로 교체:
- prepare가 eligible actor의 non-null target에 대해 존재·생존을 모두 검증하므로 두 throw는 여전히 도달 불가능하다.
- **NIGHT 진행 중 생존 집합은 변하지 않는다** — `alive = false`는 이 함수(직후 NIGHT를 벗어남)와 `commitTribunalVoteResolution`(TRIBUNAL phase) 두 곳뿐이다.

---

## 3. 테스트 계획

### `backend/game-core/__tests__/gameSession.test.js`
기존 픽스처 `commitFullRoleSessionAtNight`(10인 · 5역할 각 1명), `commitJokerTrioSessionAtNight`, `setupTribunalReadySession`, `commitTrioSessionAtDay`를 그대로 재사용한다. 사망 재현은 기존 스타일대로 `session.players.get(uuid).alive = false`(:2647 선례).

| # | 테스트 | 요구사항 |
|---|---|---|
| T1 | `getEligibleNightActorUuids`: 사망한 DOCTOR는 목록에서 빠지고 생존 JOKER/GUARD만 남는다 | 1 |
| T2 | **교착 재현→해소**: DOCTOR를 사망 처리하고 JOKER·GUARD만 제출 → `prepareNightResolution`이 `ACTIONS_PENDING`이 아니라 `ok:true` | 1, 테스트① |
| T3 | `submitNightAction`: 사망한 JOKER/DOCTOR/GUARD 각각 → `{ok:false, code:'ACTOR_NOT_ALIVE'}`이고 `nightActions`는 불변 (역할 배열 루프) | 2, 테스트② |
| T4 | `submitNightAction`: 사망한 CITIZEN → `NOT_ELIGIBLE`이 아니라 `ACTOR_NOT_ALIVE`(생존 검사가 eligibility보다 먼저) | 2 |
| T5 | `submitNightAction`: 사망한 대상 지목 → `{ok:false, code:'TARGET_NOT_ALIVE'}`이고 Map 불변. JOKER가 사망한 CITIZEN을 지목하는 경우도 포함 | 2 |
| T6 | 제출 후 사망한 JOKER의 잔여 엔트리는 암살 집계에 반영되지 않는다(제출 → `alive=false` → `prepareNightResolution` → `assassinationTargetId === null`, 희생자 없음) | 1, 3 |
| T7 | **불변조건 고정**: `commitNightResolution`이 `ok:true`를 반환한 뒤 `session.phase`는 절대 `'NIGHT'`이 아니다(희생자 있는 밤·없는 밤·종결되는 밤 3케이스) → "밤 도중 사망 불가능"의 코드 수준 근거 | 3 |
| T8 | **전원 사망/부재 밤**: `jokerCount:0` 3인 AUTO 세션을 NIGHT로 되돌림 → `getEligibleNightActorUuids`가 `[]` → `prepareNightResolution` 즉시 `ok:true` → `commitNightResolution`이 `terminal:{winner:'CITIZEN'}`. 더불어 "JOKER가 있는 세션에서는 마지막 JOKER 사망이 곧 ENDED라 이 상태에 도달할 수 없다"를 재판 유죄로 JOKER를 처형해 확인 | 명확히 할 규칙, 테스트③ |
| T9 | **밤 시작 전 사망 end-to-end**: 밤 행동 보유자가 재판에서 처형된 뒤의 NIGHT에서, 그 사망자가 제출하지 않아도 `prepareNightResolution`→`commitNightResolution`이 정상 진행되고 DAY로 넘어간다 | 3, 4 |

T9 픽스처 주의: `setupTribunalReadySession`은 역할이 `randomFn`에 좌우된다. 기존 테스트(:2879)가 `randomFn: () => 0, // fn2 == JOKER` 주석으로 고정하는 방식을 따라, 처형 대상이 실제로 밤 행동 보유 역할인지 테스트 안에서 `assert.equal(session.players.get(x).role, 'DOCTOR')`로 먼저 고정한 뒤 진행한다(역할 배정이 바뀌면 테스트가 조용히 무의미해지지 않도록).

### `backend/socket/__tests__/gameSession.test.js`
| # | 테스트 |
|---|---|
| S1 | `submit_night_action`: 사망한 참가자 → ack `{ok:false, code:'ACTOR_NOT_ALIVE', message:'요청을 처리할 수 없습니다.'}`이고 `session.nightActions`는 불변 (사망 처리 선례: :1725, :1926) |
| S2 | `resolve_night`: 사망한 행동 보유자가 미제출인데도 `ok:true`이고 `night_result_applied`가 **참가자 전원(사망자 포함)** 에게 정확히 1건씩 방송된다 |
| S3 | 사망한 GUARD에게는 `night_action_result`가 전달되지 않는다(C6 검증) |

S2/S3용 픽스처: 기존 `commitFourPlayerSessionWithSocketsAtNight`는 4인이라 `getSpecialRoleBudget(4) === {0,0,0}`으로 DOCTOR/GUARD가 없다. **8인 픽스처 `commitEightPlayerSessionWithSocketsAtNight`를 새로 추가**한다(`jokerCount:1` → JOKER 1 / DOCTOR 1 / GUARD 1 / CITIZEN 5). 기존 두 픽스처와 동일한 골격(`buildSessionCandidate` → `commitGameSession` → `ackAllAndRewindToFirstNight` → fake socket join → `createFakeIo`)을 그대로 복제하고, 역할별 uuid를 반환한다.

### `frontend/.../__tests__/useInGameActionPanel.test.js`
기존 `renderActionPanelProbe(contextValue)` 헬퍼(:399)를 재사용한다.
| # | 테스트 |
|---|---|
| F1 | NIGHT phase + 본인 `status: "dead"` → `nightActionsLocked === true` |
| F2 | (positive control) NIGHT phase + 본인 `status: "alive"` + `resolveNightStatus` idle → `nightActionsLocked === false` |

---

## 4. 프런트엔드 변경 (최소 게이트만)

요구 동작 2의 전반부("UI 대상에서 제외")와 "하지 않는 것: UI 변경"이 표면적으로 충돌한다. **레이아웃·문구·컴포넌트를 새로 만들지 않고, 기존에 이미 존재하는 잠금 패턴과 기존 안내 문구를 재사용하는 선에서만** 처리한다.

### F-C1. `useInGameActionPanel.js:232`
```js
const nightActionsLocked =
    interactionBlocked ||
    isGameEnded ||
    !isSessionPlayerAlive(localSessionPlayer) ||   // ← 추가
    resolveNightRequest.status !== 'idle' ||
    gameState?.phase !== 'NIGHT'
```
`isSessionPlayerAlive`와 `localSessionPlayer`는 이 파일에 **이미 import·계산되어 있다**(:11, :135). 바로 아래 `dayVoteControlsEnabled:226`이 쓰는 것과 동일한 헬퍼·동일한 값이므로 낮/밤 정책이 한 규칙으로 맞춰진다. `localSessionPlayer`가 `undefined`일 때 `isSessionPlayerAlive`가 `true`를 돌려주는 기존 폴백도 그대로 승계된다(기존 ENDED 테스트들은 `isGameEnded`로 이미 true라 영향 없음).

### F-C2. `InGameActionPanel.jsx:268`
```jsx
{nightActionType === null || nightActionsLocked ? (
  <p className={INGAME_ACTION_META_CLASS}>이 밤에는 행동할 수 없습니다.</p>
) : ( ... )}
```
**새 문구·새 컴포넌트·새 스타일 없음** — 이미 있는 "이 밤에는 행동할 수 없습니다." 분기의 조건만 넓힌다. 사망자에게 영구히 비활성화된 버튼 두 개를 보여주는 대신 기존 안내로 대체하는 것이 요구 동작 2("UI 대상에서 제외")의 최소 충족이다.

> ⚠️ **인코딩 주의:** `useInGameActionPanel.js`에는 이미 mojibake로 깨진 한글 주석이 다수 존재한다(:102-119, :150-151 등). **기존 줄을 재작성하지 말고 새 줄만 삽입**할 것. 편집 후 `npm run check:utf8 --prefix frontend`를 반드시 통과시킨다.

---

## 5. 검증

```powershell
npm run test:game-core --prefix backend    # 기존 345 + 신규 8, 전부 통과
npm test --prefix backend                  # socket/utils 포함 (backend/.env.test 존재 확인됨)
npm test --prefix frontend
npm run check:utf8 --prefix frontend
npm run lint --prefix frontend
```

- "기존 345개"는 `test:game-core` 스위트다(정적 `test(` 호출 297개 + `eligibilityTable` 등 루프 생성분). 신규 테스트 추가 후 **총계가 345 + 신규 개수와 정확히 맞는지** 확인해 기존 테스트가 조용히 사라지지 않았음을 보장한다.
- 요구 동작 4(가드 조사 R1~R4 회귀 없음): 가드 조사 관련 판정은 `computeGuardInvestigationResult:765` → `privateResults` → `night_action_result` 경로다. C6(사망한 GUARD 제외) 외에는 이 경로를 건드리지 않으며, 생존 GUARD의 조사 결과 계산·전달은 완전히 동일하다. 회귀 근거는 위 전체 스위트 통과 + S3.

---

## 6. 위험 요소와 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| C4의 루프 범위 축소로 기존 `TARGET_NOT_A_PARTICIPANT` 테스트가 깨질 수 있음 | game-core 회귀 | 구현 전 grep으로 재확인(현재 확인상 game-core에는 해당 테스트 없음). 깨지면 전체 스캔 루프를 남기고 생존 검사만 덧붙이는 방식으로 후퇴 |
| C3으로 JOKER→사망한 동료 지목이 no-op에서 명시적 거부로 바뀜 | 기존 JOKER no-op 테스트 4건(:1571-1642) | 해당 픽스처는 전원 생존이라 영향 없음. 정책 변화는 코드 주석에 명시 |
| C2로 사망한 CITIZEN 응답이 `NOT_ELIGIBLE`→`ACTOR_NOT_ALIVE`로 바뀜 | 기존 테스트 :1484 | 그 픽스처도 전원 생존이라 영향 없음 |
| 프런트 `nightActionsLocked`에 생존 조건을 넣으면 세션 컨텍스트가 비었을 때(`{}`) 오동작 | 기존 ENDED 테스트 3건 | `isSessionPlayerAlive(undefined) === true`(생존 취급) — `dayVoteControlsEnabled`의 기존 동작과 동일. ENDED 케이스는 `isGameEnded`로 이미 잠김 |
| mojibake 파일 편집 중 인코딩 손상 | `check:utf8` 실패 | 삽입만 하고 기존 줄 미변경 + 검증 스크립트 실행 |
| 8인 소켓 픽스처의 역할 배정이 `randomFn`에 의존 | S2/S3가 조용히 무의미해질 수 있음 | 픽스처가 역할별 uuid를 조회해 반환하고, 테스트 안에서 DOCTOR/GUARD 존재를 `assert`로 먼저 고정 |

## 7. 범위 밖 (명시적으로 하지 않음)
- 서버 측 밤 자동 판정 타이머 — 이 저장소의 세 판정 모두 클라이언트 트리거이며, 추가 시 새 메커니즘이 된다.
- `submitNightAction`의 JOKER 팀 no-op 정책 자체(살아있는 동료 대상)는 그대로 둔다.
- 다른 직업 로직·새로고침 세션 문제·인게임 화면 디자인 변경.
- `jokerCount: 0` 세션을 game-core에서 거부하도록 하는 입력 검증 강화 — T8이 그 상태의 정의된 동작을 고정할 뿐, 검증 규칙은 바꾸지 않는다(별도 slice 후보).
