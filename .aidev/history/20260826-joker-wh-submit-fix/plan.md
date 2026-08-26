# WITCH_HUNTER 시신 제출 밤 교착 — 수정 계획

## 0. 진단 결론 (먼저)

**제출 경로에는 사망 대상을 거부하는 지점이 없다.** 소켓 수신 → 턴 게이트 → game-core 검증 → 저장까지 전 구간을 읽어 확인했다. 실제 교착 원인은 제출이 아니라 **밤 판정 준비 단계**다.

### 제출 경로 전수 추적 (거부 지점 후보 전부)

| 순서 | 위치 | 사망자 대상일 때 |
| --- | --- | --- |
| 1 | `backend/socket/gameSession.js:1459` `registerGameHandlers` → `submit_night_action` 배선 | 사전 검증 없음 (그대로 위임) |
| 2 | `backend/socket/gameSession.js:275-299` `handleSubmitNightAction` payload 검증 | `targetId`는 `null` 또는 `string`만 본다. **alive 검사 없음** |
| 3 | `backend/game-core/gameSession.js:1127-1150` `checkNightTurnGate` | *actor* 생존(`ACTOR_NOT_ALIVE`)·현재 턴만 본다. **target은 아예 보지 않는다** |
| 4 | `backend/game-core/gameSession.js:1054-1056` `submitNightAction` — target 참가자 존재 | 사망자도 `session.players`에 그대로 남는다(`commitNightResolution:1330`은 `victim.alive = false`일 뿐 `delete`하지 않고, `commitTribunalVoteResolution:1849`도 동일). → **통과** |
| 5 | `:1066-1068` WITCH_HUNTER 분기 | `targetPlayer.alive === true`일 때만 거부. 시신은 `false` → **통과** |
| 6 | `:1070-1072` self-target | 대상이 남이면 무관 → **통과** |
| 7 | `:1075` `session.nightActions.set(uuid, targetId)` | **저장된다** |

즉 요구서 1번(“WH의 사망자 지목이 nightActions에 저장된다”)은 **현재 코드에서 이미 성립한다**. `backend/socket/__tests__/nightTurnProgression.test.js:253-284`(`corpse present`)가 소켓 진입점부터 그것을 이미 증명하고 있다.

### 진짜 차단 지점

```
backend/game-core/gameSession.js:935  getEligibleNightActorUuids   ← 결함 본체
backend/game-core/gameSession.js:1200 prepareNightResolution        ← 증상이 관측되는 곳(ACTIONS_PENDING)
backend/socket/gameSession.js:358-366 handleSubmitNightAction       ← 실패가 조용히 삼켜지는 곳
```

`getEligibleNightActorUuids`(`:935-941`)는 `session.players`를 훑으며 **`alive`를 전혀 필터하지 않는다**. 반면 순차 턴 기계(`getLivingNightTurnActorUuids:1085-1092`, `computeCurrentNightTurnRole:1102-1110`)와 턴 게이트(`checkNightTurnGate:1145`)는 **생존자만** 배우로 취급한다. 두 정의가 어긋나 있다:

- 죽은 JOKER/DOCTOR/GUARD/WITCH_HUNTER는 **턴을 절대 받지 못하고**(`computeCurrentNightTurnRole`이 건너뜀), 강제로 제출을 시도해도 `ACTOR_NOT_ALIVE`로 막힌다.
- 그런데 `prepareNightResolution:1200-1202`는 그 죽은 배우의 `nightActions` 엔트리를 **영원히 기다린다** → `ACTIONS_PENDING`.

요구서의 재현 조건(“제 2일 밤, 5인 중 1명 사망”)과 정확히 일치한다. 그 사망자가 밤 행동 역할(DOCTOR/GUARD/JOKER) 보유자면:

1. 생존 배우 JOKER → GUARD → **WITCH_HUNTER** 순으로 제출이 정상 진행되고, WH의 시신 지목도 `{ok:true}`로 저장된다.
2. 마지막 제출이므로 `computeCurrentNightTurnRole`이 `null` → `handleSubmitNightAction:358-366`이 자동 판정(`handleResolveNight`)을 호출한다.
3. `prepareNightResolution`이 죽은 DOCTOR의 미제출 때문에 `ACTIONS_PENDING`을 반환한다.
4. 그 자동 호출의 callback은 `() => {}`(`:362`)라 **ack도 로그도 남지 않는다**. 밤이 끝나지 않고 게임 전체가 교착된다.

WH가 canonical 순서의 **마지막 역할**이라, 플레이어 시점에서는 “WH가 시신을 지목한 순간 멈췄다”로 관측된다 — 요구서가 WH 제출 거부로 기술한 이유다.

이 결함은 이미 저장소에 두 번 기록되어 있다:
- `backend/game-core/__tests__/gameSession.test.js:2428-2430` — “`getEligibleNightActorUuids`가 생존을 필터하지 않아 그 밤이 영원히 ACTIONS_PENDING이 된다 — 선재 결함이라 피해 간다”며 **일부러 CITIZEN을 죽여 우회**한다.
- `backend/socket/__tests__/nightTurnProgression.test.js:152-155` — 같은 이유로 CITIZEN을 죽인다.

낮 경로에는 같은 결함이 없다: `getEligibleDayVoterUuids:1422-1428`은 `if (player.alive)`로 이미 필터하고, `gameSession.test.js:3085`가 그 계약을 고정하고 있다. 밤 경로만 빠져 있다.

---

## 1. 수정

### 1-1. `backend/game-core/gameSession.js` — `getEligibleNightActorUuids` (`:933-941`)

생존 필터를 추가한다. 이것이 이번 수정의 **유일한 동작 변경**이다.

```js
function getEligibleNightActorUuids(session) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive !== true) continue
        if (isEligibleForNightAction(session, player.role)) uuids.push(player.uuid)
    }
    return uuids
}
```

주석도 함께 갱신한다. 담을 근거:
- “이 밤에 실제로 제출해야 하는 배우”의 정의는 순차 턴 기계(`getLivingNightTurnActorUuids`)·턴 게이트(`checkNightTurnGate`의 `ACTOR_NOT_ALIVE`)와 **반드시 일치해야 한다**. 턴을 받지 못하는 배우를 기다리면 그 밤은 구조적으로 끝나지 않는다.
- 생존 판정은 `player.alive !== true`로 쓴다 — `hasAnyDeadPlayer:905`·`getChatRecipientUuids:209`와 같은 관례이고, `getLivingNightTurnActorUuids`의 truthy 검사보다 **더 넓게 제외**하므로 “턴은 안 주면서 기다리기만 하는” 상태가 어떤 `alive` 값에서도 생기지 않는다(한 방향으로만 안전하다).
- 낮 경로 `getEligibleDayVoterUuids`와 대칭이라는 점.

### 1-2. `backend/game-core/gameSession.js` — `prepareNightResolution` JSDoc (`:1174`)

검증 순서 6번 “모든 eligible actor의 nightActions 제출 완료” → “**모든 생존 eligible actor**의 …”로 문구를 맞춘다. 본문 로직은 건드리지 않는다(`:1200-1202` 루프 그대로).

### 1-3. 하지 않는 것 (의도적 비목표)

- `submitNightAction`의 WITCH_HUNTER/JOKER/DOCTOR/GUARD 대상 검증은 **한 줄도 바꾸지 않는다** — 요구사항 2 불변. WH 생존자 지목은 `:1066-1068`에서 계속 `INVALID_TARGET`이다.
- `handleSubmitNightAction:362`의 자동 판정 실패를 로그로 남기는 개선은 하지 않는다. 이 파일은 로그 키 구조에 엄격한 계약과 다수의 회귀 테스트가 걸려 있고, 이번 결함의 원인이 아니라 가시성 문제다. 별도 슬라이스 후보로만 남긴다.
- game-core `submitNightAction`이 사망한 *actor*의 제출을 직접 거부하지 않는 점(현재는 `checkNightTurnGate`만 막는다)도 손대지 않는다. production 경로에서는 도달 불가능하고, 범위 밖이다.
- `prepareNightResolution:1218-1226`의 privateResults 루프는 그대로 둔다. 죽은 GUARD/WH는 `nightActions` 엔트리가 없어 `computeGuardInvestigationResult`/`computeWitchHunterConfirmationResult`가 `null`을 돌려주므로 이미 자동으로 제외된다.

---

## 2. 검증

### 2-1. 통합 테스트 (필수 — 이번 버그를 단위 분기가 놓친 지점)

`backend/socket/__tests__/nightTurnProgression.test.js`에 테스트 하나를 추가한다. 이 파일은 이미 **실제 소켓 핸들러(`handleSubmitNightAction` + `{ io }`)** 를 진입점으로 구동하고 자동 판정까지 배선되어 있어 요구서의 “소켓 계층 진입점부터” 조건을 그대로 만족한다. 기존 헬퍼(`makeCustomRoom`/`commitCustom`/`ackAllAndRewindToNight`/`wireSockets`/`byRole`/`submit`)를 그대로 재사용한다 — 새 헬퍼 파일은 만들지 않는다.

시나리오(요구서의 재현 조건 그대로):

```
5인 custom room { JOKER, DOCTOR, GUARD, WITCH_HUNTER, CITIZEN }
ackAllAndRewindToNight(session, { dayIndex: 1 })
session.players.get(doctorUuid).alive = false        ← 시신이 "밤 행동 역할" 보유자다(핵심 재현 조건)
```

1. `submit(JOKER, null)` → `{ok:true}`, 턴이 DOCTOR를 건너뛰고 `GUARD`로 넘어간다.
2. `submit(GUARD, citizenUuid)` → `{ok:true}`, 턴 `WITCH_HUNTER`.
3. **생존자 지목 회귀**: `submit(WITCH_HUNTER, citizenUuid)`(생존) → `{ok:false, code:'INVALID_TARGET', message:'요청을 처리할 수 없습니다.'}`, `session.nightActions` 불변, 턴 여전히 `WITCH_HUNTER`, phase `NIGHT`.
4. **시신 지목 제출**: `submit(WITCH_HUNTER, doctorUuid)` → `{ok:true}`, `session.nightActions.get(witchHunterUuid) === doctorUuid`.
5. **밤 판정까지 트리거**(수정 전 실패 지점): `session.phase === 'DAY'`, `session.dayIndex === 2`, `session.nightResolution !== null`.
6. 참가자 전원이 `night_actions_resolved` / `night_result_applied`를 정확히 1건씩 받는다.
7. WITCH_HUNTER 본인만 `night_action_result`를 받고 payload가 `{gameId, dayIndex: 1, actionType:'CONFIRM', targetId: doctorUuid, role:'DOCTOR'}`다.

승리 조건 검토: 생존 JOKER 1 · 비JOKER 3, JOKER는 SKIP이므로 희생자가 없다 → `evaluateWinCondition`이 `null`을 반환해 `enterDayPhase`로 정상 전이한다(ENDED로 새지 않는다).

**수정 전 이 테스트는 5번에서 실패한다**(phase가 `NIGHT`에 머문다) — 회귀 방지력이 실제로 있다는 증거.

`enterDayPhase:801-805`는 `nightActions`를 비우지 않으므로 자동 판정 이후에도 4번의 단언은 유효하다(기존 `:283` 단언과 동일한 근거).

### 2-2. 단위 테스트 — `backend/game-core/__tests__/gameSession.test.js`

- `getEligibleNightActorUuids: 사망한 밤 행동 역할 보유자는 목록에서 제외된다` — `commitFullRoleSessionAtNight` 픽스처에서 DOCTOR를 죽이고 반환 목록에 없음을 확인. (`gameSession.__testables.getEligibleNightActorUuids`는 이미 `:2475`에 노출되어 있다. 상단 구조분해 목록에 이름을 추가하거나 `gameSession.__testables.`로 직접 참조한다.)
- `prepareNightResolution: 사망한 eligible 역할 보유자는 제출하지 않아도 ACTIONS_PENDING을 막지 않는다` — `getEligibleDayVoterUuids`의 대칭 테스트(`:3085`)와 같은 형태.
- 낡은 주석 갱신: `:2428-2430`의 “선재 결함이라 건드리지 않고 피해 간다”를 “이제 생존 필터가 있으므로 우회가 아니라 의도적 구성”으로 정정한다(테스트 본문은 그대로 통과한다).

### 2-3. 기존 테스트

- `backend/socket/__tests__/nightTurnProgression.test.js:152-155`의 주석(“죽은 eligible 배우는 판정을 ACTIONS_PENDING에 묶는다”)을 현재 동작에 맞게 정정한다. 테스트 본문은 변경 없이 통과한다.
- 이번 변경은 `prepareNightResolution`을 **더 관대하게만** 만든다(기다릴 대상이 줄어들 뿐 늘지 않는다). 따라서 `ok:true`를 기대하던 테스트는 전부 그대로 통과하고, 깨질 수 있는 것은 “죽은 eligible 배우 때문에 ACTIONS_PENDING이어야 한다”를 단언하는 테스트뿐인데, 저장소를 훑은 결과 그런 단언은 존재하지 않는다(`ACTIONS_PENDING` 단언은 `nightTurnProgression.test.js:439`의 “이른 resolve_night” 하나뿐이고 거기엔 사망자가 없다).

### 2-4. 실행

```
node --test backend/game-core/__tests__/ backend/socket/__tests__/ backend/utils/__tests__/
```
(저장소의 backend 테스트 실행 방식을 그대로 따른다. 외부 의존성이 필요한 스위트가 있으면 기존 슬라이스와 동일하게 그 사실을 기록한다.) backend 전체 PASS가 완료 조건이다.

---

## 3. 위험 요소

| 위험 | 평가 |
| --- | --- |
| 살아있는 배우가 필터에 잘못 걸려 판정이 조기에 일어난다 | `player.alive !== true`는 `commitGameSession:700-701`이 신규 세션 전원에 대해 `alive === true`를 강제하고, 이후 `false`로만 바뀐다. 생존자가 걸릴 값이 없다. |
| 생존 eligible 배우가 0명인 밤이 생겨 아무도 자동 판정을 트리거하지 못한다 | JOKER가 전멸하면 `evaluateWinCondition`이 즉시 CITIZEN 승리로 세션을 종료시킨다(`:235`). 밤이 시작될 수 있다는 것은 생존 JOKER가 있다는 뜻이고, JOKER는 `nightActionMinDayIndex: 0`이라 항상 eligible이다 → 배우가 최소 1명 보장된다. |
| 죽은 JOKER의 잔여 표가 `tallyJokerAssassinationTarget`에 섞인다 | 불가능하다. `nightActions`는 NIGHT 진입마다 새 Map으로 교체되고(`:1584`, `:1871`, `commitNightResolution`→`enterDayPhase` 경로), NIGHT 중에는 `alive`가 바뀌지 않는다(`:894-896`). 죽은 배우의 엔트리는 애초에 만들어질 수 없다. |
| e2e 시나리오가 기존(교착) 동작에 의존한다 | e2e는 수정 금지이자 이번 파이프라인에서 실행되지 않는다. `e2e/lib/scenarioPlan.js:147 witchHunterCanActOn`은 “그 밤에 시신이 있는가”만 판정하므로 이 변경과 무관하고, 밤이 정상 종료되는 방향의 변화라 시나리오에 유리하다. |
| 요구서 1번이 이미 성립하므로 “고칠 게 없다”로 오독될 수 있다 | 통합 테스트가 제출 성공 **과** 판정 트리거를 한 경로에서 함께 단언하므로, 실제 교착이 사라졌다는 증거가 테스트로 남는다. |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js | getEligibleNightActorUuids | 생존 필터 추가 — 턴 기계와 대기 대상 정의를 일치시켜 교착 제거 |
| MODIFY | backend/game-core/gameSession.js | prepareNightResolution | JSDoc 검증 순서 6번을 "생존 eligible actor"로 정정 |
| MODIFY | backend/socket/__tests__/nightTurnProgression.test.js |  | 5인·시신이 행동역할 보유자인 밤의 소켓 진입점 통합 회귀 테스트 추가, 낡은 주석 정정 |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | 생존 필터·ACTIONS_PENDING 단위 테스트 추가, 선재 결함 주석 정정 |
| REFERENCE | backend/socket/gameSession.js | handleSubmitNightAction | 자동 판정 호출 지점과 실패가 삼켜지는 지점(변경하지 않음) |
