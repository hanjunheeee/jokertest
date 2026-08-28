# joker-D · 밤 해소 규칙 명세화 — 구현 계획

## 0. 현재 코드 확인 결과 (요구별 gap)

| 요구 | 현재 상태 | 필요한 작업 |
| --- | --- | --- |
| 1. 보호 성공 시 광대에게 실패 통지 | `prepareNightResolution`(backend/game-core/gameSession.js:1159-1178)은 보호된 암살을 `pendingEliminationTargetId = null`로만 처리하고 **광대에게 아무 통지도 만들지 않는다**. `privateResults`에는 GUARD/WITCH_HUNTER 항목만 들어간다. | 코드 추가 (핵심) |
| 2. 의사 사망 시 보호 소멸 | 보호 대조는 `computeDoctorProtectionSet`(:949, 생존 의사만) → prepare 단계, 사망 확정은 `commitNightResolution`(:1289) → commit 단계라 순서 자체는 이미 맞다. 그러나 "사망자의 잔여 효과 소멸"은 **코드에 명시된 단계가 없고**(다음 NIGHT 진입 시 `session.nightActions = new Map()`으로 통째로 사라질 뿐 — :1724, :2022) 테스트도 없다. | 명시적 소멸 단계 추가 + 테스트 |
| 3. 경비원 조사와 대상 사망의 독립 | `privateResults`가 prepare(사망 확정 이전)에서 만들어지고 commit이 이를 건드리지 않으므로 **이미 성립**한다. | 테스트로 고정만 |
| 4. 밤 사망 직후 승리 재평가 | `commitNightResolution`이 `victim.alive = false` 직후 `evaluateWinCondition` → 승자 있으면 `finalizeGameSession`, `enterDayPhase` 미실행(:1289-1300)이라 **이미 성립**한다. 다만 production 경로(제출→prepare→commit) 전체를 통과하는 테스트가 없고, 손으로 만든 resolution 기반 테스트만 있다(:2238, :2255). | 판정 순서 주석 명문화 + production 경로 테스트 |

즉 실제 동작이 바뀌는 것은 **요구 1 하나**이고, 요구 2는 "코드에 단계로 존재하게 만드는 것", 요구 3·4는 "테스트로 고정하는 것"이다.

---

## 1. backend/game-core/gameSession.js (MODIFY)

### 1-1. 암살 실패 통지 생성기 (신규 함수)

`computeWitchHunterConfirmationResult`(:976) 바로 아래에 추가한다.

```js
// 보호로 암살이 무산된 밤에 "생존한 광대 본인"에게만 가는 개인 통지의 canonical 형태다.
// 키는 정확히 두 개(actionType/success)이고, 보호자 uuid·보호자 역할·대상·사유는 어떤
// 필드에도 담지 않는다 — 광대가 알 수 있는 것은 "이번 밤의 암살이 성사되지 않았다"는
// 사실 하나뿐이다(다른 참가자에게는 사망 없는 밤으로만 보인다).
// 매 호출마다 새 객체를 만들어 수신자별로 나눠 준다(소켓 계층이 spread해 payload에 담으므로
// 하나를 공유하면 한 수신자 경로의 오염이 나머지에 전파될 수 있다).
function buildAssassinationFailureNotice() {
    return { actionType: 'ASSASSINATE', success: false }
}
```

`actionType`은 기존 `'INVESTIGATE'`/`'CONFIRM'`과 같은 계열의 동사이고, 소켓 계층
(`backend/socket/gameSession.js:825-836`)이 `privateResults`에 항목이 있는 수신자에게만
`night_action_result`를 개별 emit하므로 **소켓 코드는 한 줄도 바뀌지 않는다**.

### 1-2. `prepareNightResolution` — 보호 성공 판정을 이름 있는 값으로 꺼내고 통지 생성

:1159-1178 구간을 다음 형태로 바꾼다(기존 계산 결과는 그대로 유지).

```js
const assassinationTargetId = tallyJokerAssassinationTarget(session)
const protectedTargetIds = computeDoctorProtectionSet(session)
// 판정 순서 1단계 — "보호 대조"다. 이 대조는 사망 확정(commitNightResolution)보다 반드시
// 먼저 끝난다: 여기서 쓰는 보호 집합은 "아직 아무도 죽지 않은" 밤의 생존 의사들에게서
// 나온 것이고, 사망이 확정된 뒤의 소멸은 3단계에서 별도로 일어난다.
const assassinationBlocked =
    assassinationTargetId !== null && protectedTargetIds.has(assassinationTargetId)
const pendingEliminationTargetId = assassinationBlocked ? null : assassinationTargetId
```

`privateResults` 루프(:1167-1178)의 if-chain 끝에 분기를 추가한다.

```js
} else if (player.role === 'JOKER' && assassinationBlocked) {
    // 보호로 막힌 밤에만, 그리고 생존한 광대에게만 실패 통지를 만든다(루프 선두의
    // alive 필터가 사망한 광대를 이미 제외한다). 실패 통지는 광대 전원에게 간다 —
    // 암살은 tallyJokerAssassinationTarget이 집계하는 진영 단위 행동이므로 "누가 그
    // 대상에 투표했는지"로 수신자를 가르지 않는다.
    privateResults.set(player.uuid, buildAssassinationFailureNotice())
}
```

역할이 서로 배타적이라 한 참가자가 GUARD/WH 항목과 JOKER 항목을 동시에 갖는 경우는 없다.
암살 대상이 없는 밤(전원 SKIP·동률)에는 `assassinationBlocked`가 false라 통지가 없다 —
"실패"는 보호로 막힌 경우만 뜻한다.

JSDoc(:1104-1109)의 `privateResults` 설명에 JOKER 항목과 그 조건, 그리고 "보호자·사유를
담지 않는다"는 계약을 추가한다.

### 1-3. 사망자 잔여 효과 소멸 (신규 함수)

`buildNightDeathReveals`(:1233) 아래에 추가한다.

```js
// 밤 해소 판정 순서의 3단계 — "사망자의 잔여 효과 소멸"이다. 이번 밤에 사망이 확정된
// 참가자가 남긴 밤 행동 엔트리(의사가 타인에게 건 보호, 경비원의 조사 지시 등)를
// session.nightActions에서 제거하고, 실제로 지워진 actor uuid 목록을 돌려준다.
//
// 오늘의 스펙(킬 소스가 JOKER 하나뿐)에서는 이 소멸이 관측 가능한 결과를 바꾸지 않는다 —
// 보호 대조(1단계)는 사망 확정(2단계)보다 먼저 끝나고, 이 밤 이후 nightActions는 다음
// NIGHT 진입에서 어차피 새 Map으로 교체되기 때문이다. 그럼에도 단계를 코드로 남기는 이유는
// 킬 직업이 하나 더 생기는 순간 "죽은 의사의 보호가 두 번째 킬을 계속 막는가"라는 질문이
// 곧바로 관측 가능해지기 때문이다. 그때 답이 조용히 갈리지 않도록 순서를 지금 고정한다.
//
// 호출자는 "alive → dead로 실제 바뀐" 참가자만 넘겨야 한다(buildNightDeathReveals와 같은
// 계약). 엔트리가 없는 uuid는 조용히 무시한다.
function expireDeadPlayerNightEffects(session, deadUuids) {
    const expired = []
    for (const uuid of deadUuids) {
        if (!session.nightActions.has(uuid)) continue
        session.nightActions.delete(uuid)
        expired.push(uuid)
    }
    return expired
}
```

### 1-4. `commitNightResolution` — 판정 순서를 코드에 명시

:1281-1300 구간에 3단계 호출을 끼워 넣고, 함수 JSDoc 상단에 canonical 순서를 못박는다.

```js
    resolution.publicDeathReveals = buildNightDeathReveals(resolution, victimUuid === null ? [] : [victimUuid])
    session.nightResolution = resolution
    // 판정 순서 2단계 — 사망 확정. (1단계 보호 대조는 prepareNightResolution이 이미 끝냈다.)
    if (victim) victim.alive = false
    // 판정 순서 3단계 — 사망자의 잔여 효과 소멸. 반드시 사망 확정 "뒤"에 온다.
    expireDeadPlayerNightEffects(session, victimUuid === null ? [] : [victimUuid])

    // 판정 순서 4단계 — 승리 재평가는 사망 이벤트 직후 항상, 낮 진입(enterDayPhase) 전에
    // 한다(처형·끊김 사망과 공유하는 원칙). 승자가 확정된 밤은 DAY로 넘어가지 않는다.
    const winResult = evaluateWinCondition(session)
```

`victim.alive = false` 이후 구간이 "절대 throw하지 않는다"는 기존 계약은 유지된다
(`expireDeadPlayerNightEffects`는 Map 조회·삭제만 한다).

### 1-5. `__testables` 확장

:2614-2647 블록에 `buildAssassinationFailureNotice`, `expireDeadPlayerNightEffects`를 추가한다
(공개 export 목록은 건드리지 않는다 — 소켓 계층이 직접 쓰지 않는 내부 단계다).

---

## 2. backend/game-core/__tests__/gameSession.test.js (MODIFY)

기존 "공개 사망 reveal" 섹션(:2319-)의 뒤에 새 섹션
`밤 해소 규칙 — 보호 실패 통지 / 판정 순서 / 조사 독립 / 승리 재평가`를 추가한다.
픽스처는 전부 기존 헬퍼(`ackAllAndRewindToFirstNight`, `nightSessionOf3`,
`nightSessionOf4NoWin`, `commitFullRoleSessionAtNight`, `makeCustomRoom`)를 재사용한다.

**요구 1 — 보호 성공 시 광대 실패 통지**
1. `보호 성공: 광대에게만 실패 통지가 만들어지고 대상은 생존하며 사망 reveal이 없다` —
   makeCustomRoom 5인(JOKER 1 / DOCTOR 1 / CITIZEN 3, `roleCounts:{JOKER:1,DOCTOR:1,GUARD:0,WITCH_HUNTER:0}`),
   광대가 시민 X 지목 + 의사가 X 보호 → prepare에서
   `[...privateResults.keys()]`가 정확히 `[jokerUuid]`, commit 후 X `alive:true`,
   `publicDeathReveals` `[]`, phase `DAY`·dayIndex +1(사망이 없어 승리 재평가도 무해).
2. `실패 통지 화이트리스트: 키가 정확히 [actionType, success]이고 보호자·대상·사유가 없다` —
   `Object.keys(notice).sort()` 대조 + `protectorUuid/doctorUuid/targetId/reason/role/team` 부재 확인.
3. `광대 다수: 생존한 광대 전원이 통지를 받고 사망한 광대는 받지 않는다` —
   makeCustomRoom 6인(JOKER 2 / DOCTOR 1 / CITIZEN 3), 두 광대가 같은 대상 지목 + 의사가 보호 →
   1차 prepare에서 통지 2건, 광대 하나를 `alive=false`로 바꾼 뒤 2차 prepare(prepare는 순수 함수라
   반복 호출 가능)에서 통지 1건.
4. `보호되지 않은 암살 / 무득표 밤에는 실패 통지가 없다` — 같은 픽스처에서 의사가 SKIP인 경우와
   광대가 SKIP인 경우 각각 `privateResults`에 JOKER 항목이 없음.

**요구 2 — 판정 순서(보호 대조 → 사망 확정 → 잔여 효과 소멸)**
5. `의사가 암살당한 밤: 의사는 죽고, 그가 타인에게 건 보호는 사망 뒤 소멸한다` —
   makeCustomRoom 5인(JOKER 1 / DOCTOR 1 / CITIZEN 3), 의사가 시민 A 보호, 광대가 **의사** 지목 →
   prepare의 `protectedTargetIds`에 A가 남아 있고(대조가 사망보다 먼저 끝났다는 기록),
   commit 후 의사 `alive:false`, A 생존, `session.nightActions.has(doctorUuid) === false`(보호 소멸),
   `session.nightActions.has(jokerUuid) === true`(생존자 엔트리는 그대로).
6. `expireDeadPlayerNightEffects: 사망자 엔트리만 지우고 생존자 엔트리·없는 uuid는 건드리지 않는다` —
   `__testables` 직접 호출 단위 테스트(반환값이 실제로 지워진 uuid 목록, 빈 입력은 no-op).

**요구 3 — 경비원 조사와 대상 사망의 독립**
7. `경비원이 조사한 대상이 같은 밤 암살돼도 조사 결과(role)는 그대로 통지된다` —
   `commitFullRoleSessionAtNight`(10인, dayIndex 0 → WH 비활성), 경비원이 시민 X 조사 +
   광대가 X 지목 + 의사 SKIP → prepare의 `privateResults.get(guardUuid)`가
   `{actionType:'INVESTIGATE', targetId:X, role:'CITIZEN'}`이고, commit(=X 사망) 이후에도
   `session.nightResolution.privateResults.get(guardUuid)`가 동일하다.

**요구 4 — 밤 사망 직후 승리 재평가**
8. `production 경로: 밤 사망으로 시민 수 = 광대 수가 되면 낮 진입 없이 즉시 광대 승리` —
   `nightSessionOf3`(JOKER 1 / CITIZEN 2, 유일한 eligible actor가 광대) →
   `submitNightAction` → `prepareNightResolution` → `commitNightResolution`이
   `{ok:true, victimUuid, terminal:{winner:'JOKER'}}`, phase `ENDED`,
   **dayIndex가 그대로 0**(enterDayPhase는 항상 +1이므로 낮 진입이 없었다는 증거), `winResult` 설정.
9. `밤 사망으로 광대가 전멸하면 낮 진입 없이 즉시 시민 승리` —
   킬 소스가 광대뿐이라 production 경로로는 만들 수 없으므로 기존 :2238 테스트와 같은 방식으로
   resolution을 손으로 구성하되, "낮 진입 없음"을 dayIndex 불변 + `nightResolution` 설정 +
   희생자 `alive:false`로 함께 고정한다.

---

## 3. backend/socket/__tests__/gameSession.test.js (MODIFY)

소켓 production 코드는 바꾸지 않지만, "광대에게**만**" 통지가 간다는 것은 전달 계층에서만
관측되므로 real-core 통합 테스트 1건을 `resolve_night` 섹션(:2392 부근)에 추가한다.

- `resolve_night: 보호로 막힌 암살 — night_action_result는 광대에게만 1건, 나머지는 0건이고 사망 없는 밤으로만 보인다`
  - `commitEightPlayerSessionWithSocketsAtNight`(JOKER 1 / DOCTOR 1 / GUARD 1 / CITIZEN 5) 사용.
  - 광대→시민0 지목, 의사→시민0 보호, 경비원→SKIP 후 `handleResolveNight`.
  - 광대 소켓의 `night_action_result` 1건이고 payload가 정확히
    `{gameId, dayIndex, actionType:'ASSASSINATE', success:false}`(보호자 정보 없음).
  - 의사·경비원·시민 전원의 `night_action_result`는 0건.
  - 전원 `night_result_applied` 1건이고 `victimUuid: null`, `deathReveals: []`, 전원 `alive:true`.

---

## 4. 검증

```
cd backend
npm run test:game-core        # node --test game-core/__tests__/*.test.js
npm test                      # node --env-file=.env.test --test (socket 포함 전체)
```

두 명령 모두 통과해야 한다. 특히 확인할 회귀 지점:

- `privateResults`에 JOKER 항목이 생기면서 기존 `resolve_night` 소켓 테스트의
  `night_action_result` 건수 단언이 깨지지 않는지 — 조사 결과, 기존 테스트 중 "의사가 광대의
  대상을 보호하는 밤"을 real core로 만드는 것은 없다(:2379-2381의 의사는 SKIP).
- `expireDeadPlayerNightEffects`의 `nightActions` 삭제가 commit 이후 `nightActions` 내용을
  단언하는 기존 테스트를 깨지 않는지 — commit 이후 `nightActions`를 읽는 production 경로는
  `computeHasActedThisPhase`(phase가 NIGHT일 때만)뿐이고 commit 뒤 phase는 DAY/ENDED다.
  구현 시 `nightActions` 단언을 grep으로 한 번 더 훑고, 깨지는 테스트가 있으면 그 테스트가
  검증하려던 성질을 유지한 채 기대값을 갱신한다.

## 5. 위험 요소 / 명시적 비목표

- **프런트엔드 표시**: 광대가 새로 `night_action_result`를 받게 된다. `InGameActionPanel.jsx:373-385`가
  개인 결과를 `JSON.stringify`로 일반 렌더하므로 깨지지 않고 원문 그대로 표시된다.
  전용 문구·UI는 이 슬라이스 범위 밖이라 손대지 않는다.
- **재접속 복원**: `buildSessionSnapshot`은 `privateResults`를 노출하지 않으므로(`nightResult`는
  dayIndex/victimUuid/deathReveals만), 밤 판정 직후 재접속한 광대는 실패 통지를 다시 받지 못한다.
  이는 개인 결과 전반(경비원 조사 포함)의 기존 성질이며 이 슬라이스에서 바꾸지 않는다.
- **`actionType: 'ASSASSINATE'` 명칭**: 소켓/프런트 어디에도 actionType 화이트리스트가 없어
  값 추가가 안전하다. 다만 프런트가 나중에 분기하게 되면 이 이름이 계약이 된다.
- **범위 밖 유지**: 행동 수집 구조(제출·턴·리졸버 진입점), 채팅, 끊김 처리는 건드리지 않는다.
  `submitNightAction`·`getEligibleNightActorUuids`·`tallyJokerAssassinationTarget`·
  `computeDoctorProtectionSet`의 시그니처와 동작은 그대로 둔다.

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | 실패 통지 생성·prepare 통지 분기·잔여 효과 소멸 단계·판정 순서 명문화 |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | 요구 1~4 규칙을 고정하는 game-core 테스트 |
| MODIFY | backend/socket/__tests__/gameSession.test.js |  | 실패 통지가 광대에게만 전달됨을 확인하는 통합 테스트 |
| REFERENCE | backend/socket/gameSession.js |  | privateResults → night_action_result 전달 경로(무변경) |
| REFERENCE | backend/game-core/roleComposition.js |  | CUSTOM 구성 상한 등 테스트 픽스처 제약 확인 |
| REFERENCE | frontend/src/domains/game/ingame/components/actions/InGameActionPanel.jsx |  | 개인 결과 렌더가 actionType에 분기하지 않음을 확인(무변경) |
