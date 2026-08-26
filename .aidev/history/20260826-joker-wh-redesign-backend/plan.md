# 마녀사냥꾼 리디자인 — 죽은 사람의 직업 조사 (backend) 구현 계획

## 0. 사전 조사에서 확인한 사실 (계획의 근거)

실제 코드를 읽고 확인한 것들이다. 요구사항 문구와 코드가 어긋나는 지점이 하나 있어 먼저 명시한다.

1. **`submitNightAction`에는 "대상 생존" 검증이 존재하지 않는다.**
   `backend/game-core/gameSession.js:1018-1029`의 target 검증은 (a) 참가자 존재, (b) JOKER 진영 no-op,
   (c) SELF_TARGET 세 가지뿐이고 `targetPlayer.alive`를 전혀 보지 않는다. 파일 전체에서 대상 생존을
   검사하는 곳은 낮 투표(`:1367` `TARGET_NOT_ALIVE`)와 day vote 집계(`:1488-1489`)뿐이다.
   → 요구사항 1의 "기존 '대상 생존' 검증을 ... 바꾼다"는 **전환할 기존 검증이 없다**. 실질 의도인
   "WITCH_HUNTER의 대상은 사망자만 유효"를 **새 검사 한 줄 추가**로 구현한다. 다른 역할의 target
   규칙은 지금처럼 생존 여부를 보지 않는 상태 그대로 둔다(요구사항의 "다른 역할 규칙 불변"과 일치).

2. **eligibility의 단일 소비 지점은 `isEligibleForNightAction(role, dayIndex)` 하나다.**
   호출부는 정확히 5곳이며 **전부 `session`을 이미 손에 쥐고 있다**:
   `:903`(getEligibleNightActorUuids) · `:1014`(submitNightAction) · `:1042`(getLivingNightTurnActorUuids)
   · `:1099`(checkNightTurnGate) · `:1178`(prepareNightResolution의 privateResults).
   외부 노출은 `__testables`(`:2424`) 한 곳, 테스트 import는 `backend/game-core/__tests__/gameSession.test.js:16`
   한 곳뿐이다. 따라서 **시그니처를 `(session, role)`로 바꾸는 것이 안전하고, 이 저장소가 반복해서
   강조하는 "단일 출처" 원칙에도 맞는다.** (dayIndex만 받는 옛 시그니처를 남겨두면 WITCH_HUNTER에
   대해 거짓을 답하는 함정 API가 하나 더 생긴다.)

3. **`computeCurrentNightTurnRole`은 `getLivingNightTurnActorUuids`를 통해서만 eligibility를 본다**(`:1041-1066`).
   그래서 eligibility만 바꾸면 요구사항 2의 "zero-actor처럼 건너뛴다 / night_turn_changed에도 나타나지
   않는다"가 자동으로 성립한다 — 순차 진행 쪽에 별도 분기를 넣을 필요가 없다.

4. **NIGHT phase 동안 `player.alive`는 절대 바뀌지 않는다.** `alive = false`가 되는 곳은
   `commitNightResolution`(`:1286`, 이 호출이 곧 NIGHT→DAY/ENDED 전이)과 재판 처형(`:1805`)뿐이다.
   따라서 NIGHT 중 아무 시점에나 `session.players`를 훑어 얻은 사망자 수는 **그 밤 시작 시점의 값과
   동일하다.** 요구사항 2의 "그 밤 시작 시점에 사망자 1명 이상"은 별도 스냅샷 필드 없이 순수 계산으로
   정확히 구현된다.

5. **`computeWitchHunterConfirmationResult`(`:961-966`)는 손댈 필요가 없다.** `session.players.get(targetId).role`을
   그대로 읽으므로 대상이 시신이어도 `{targetId, role}` 형태가 유지된다(요구사항 3 = 무변경으로 충족).

6. **반복 조사를 막는 코드는 애초에 없다**(`nightActions`는 매 밤 새 Map으로 리셋: `:1540`, `:1827`).
   요구사항 4는 무변경으로 충족된다.

7. **선재(pre-existing) 위험 — 이번 슬라이스에서 고치지 않는다.**
   `getEligibleNightActorUuids`(`:900-906`)는 `alive`를 필터하지 않는다. 그래서 밤 행동이 있는 역할의
   보유자가 죽은 뒤의 밤은 `prepareNightResolution`이 영원히 `ACTIONS_PENDING`이 된다(`:1156-1158`).
   이건 지금도 DOCTOR/GUARD/JOKER 전부에 해당하는 기존 결함이고, 기존 테스트는 "죽는 사람이 CITIZEN"인
   시나리오만 써서 우연히 이 구멍을 피해 간다(`__tests__/gameSession.test.js:3209-3229`가 그 예다).
   요구사항의 수정 금지·불변 범위(다른 역할의 eligibility 규칙)를 건드리게 되므로 **이번에는 고치지
   않고, 새로 쓰는 테스트도 "죽는 사람은 CITIZEN"으로 맞춰 이 구멍을 건드리지 않는다.** 아래 8절에 리스크로 남긴다.

---

## 1. `backend/game-core/gameSession.js` (MODIFY)

### 1-1. `ROLE_DEFINITIONS` — WITCH_HUNTER의 day0 제한 제거 (`:15-26`)

```js
WITCH_HUNTER: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 1 }),
→ WITCH_HUNTER: Object.freeze({ team: 'CITIZEN', nightActionMinDayIndex: 0 }),
```

`null`(밤 행동 없음)과 `0`(첫 밤부터 가능)의 구분은 CITIZEN 판별에 계속 쓰이므로 필드 자체는 남긴다.
바로 위 주석(`:15-17`)이 "이번 슬라이스의 어떤 실행 로직도 이 값을 참조하지 않는다"로 이미 낡아 있으므로,
"이 값은 dayIndex 하한만 뜻하고 WITCH_HUNTER는 추가로 사망자 존재 조건을 함께 만족해야 한다"로 갱신한다.

### 1-2. 새 헬퍼 `hasAnyDeadPlayer(session)` — `isEligibleForNightAction` 바로 위에 추가

```js
// 이 세션에 사망자가 한 명이라도 있는가(순수 계산). 사망 판정은 getChatRecipientUuids의 DEAD 채널과
// 동일하게 alive !== true다. NIGHT 동안 alive는 절대 바뀌지 않으므로(사망 반영은 NIGHT을 끝내는
// commitNightResolution과 재판 처형뿐) 이 값은 곧 "그 밤 시작 시점의 사망자 유무"다.
function hasAnyDeadPlayer(session) {
    for (const player of session.players.values()) {
        if (player.alive !== true) return true
    }
    return false
}
```

### 1-3. `isEligibleForNightAction` — 시그니처 `(session, role)`로 변경 + WITCH_HUNTER 조건 (`:890-896`)

```js
function isEligibleForNightAction(session, role) {
    const minDayIndex = ROLE_DEFINITIONS[role]?.nightActionMinDayIndex
    if (minDayIndex === null || minDayIndex === undefined) return false   // CITIZEN
    if (session.dayIndex < minDayIndex) return false
    // WITCH_HUNTER만의 추가 조건: 조사할 시신이 최소 하나 있어야 한다. 사망자가 없는 밤에는
    // 이 함수가 false를 돌려주므로 computeCurrentNightTurnRole이 zero-actor와 똑같이 건너뛰고
    // (getLivingNightTurnActorUuids가 빈 배열이 됨), night_turn_changed에도 등장하지 않는다.
    if (role === 'WITCH_HUNTER') return hasAnyDeadPlayer(session)
    return true
}
```

호출부 5곳을 새 인자 순서로 고친다:

| 위치 | 변경 후 |
| --- | --- |
| `:903` `getEligibleNightActorUuids` | `isEligibleForNightAction(session, player.role)` |
| `:1014` `submitNightAction` | `isEligibleForNightAction(session, actor.role)` |
| `:1042` `getLivingNightTurnActorUuids` | `isEligibleForNightAction(session, role)` |
| `:1099` `checkNightTurnGate` | `isEligibleForNightAction(session, actor.role)` |
| `:1178` `prepareNightResolution` | `isEligibleForNightAction(session, 'WITCH_HUNTER')` |

`getLivingNightTurnActorUuids`의 주석(`:1038-1040`)에 있는 "day0 WITCH_HUNTER 등"이라는 예시를
"사망자가 없는 밤의 WITCH_HUNTER 등"으로 갱신한다.

### 1-4. `submitNightAction` — WITCH_HUNTER 대상 사망 검증 추가 (`:1018-1029`)

JOKER no-op 분기 다음, SELF_TARGET 검사 앞에 삽입한다(actor가 JOKER이면서 동시에 WITCH_HUNTER일 수
없으므로 두 분기의 상대 순서는 관측 가능한 차이를 만들지 않지만, "역할별 대상 규칙"을 한 덩어리로 읽히게 둔다):

```js
// WITCH_HUNTER의 조사 대상은 시신뿐이다 — 생존자를 지목하면 거부한다. 이 검사가 SELF_TARGET보다
// 앞서지만 자기 자신 규칙은 그대로 남는다: 살아있는 본인은 여기서 걸리고, (핵심 계층을 직접 호출해)
// 사망한 본인을 지목하는 경로는 아래 SELF_TARGET_ALLOWED_ROLES에서 걸린다.
if (actor.role === 'WITCH_HUNTER' && targetPlayer.alive === true) {
    return { ok: false, code: 'INVALID_TARGET' }
}
```

`session.nightActions`를 건드리지 않는 실패 경로이므로 기존 "실패 = Map 불변" 계약이 유지된다.
함수 docblock의 번호 매긴 검증 순서(`:983-990`)에 이 단계를 끼워 넣고 뒤 번호를 다시 매긴다.

### 1-5. `__testables` export (`:2408-2442`)

`hasAnyDeadPlayer`를 추가한다(`isEligibleForNightAction` 바로 옆). 나머지 export는 그대로 둔다.

**손대지 않는 것:** `computeWitchHunterConfirmationResult`, `computeGuardInvestigationResult`,
`computeCurrentNightTurnRole`, `NIGHT_TURN_ROLE_ORDER`, `SELF_TARGET_ALLOWED_ROLES`,
`commitNightResolution`/`resolveNightDeathSource` 등 밤 판정·사망 판정 로직 전부,
`getEligibleNightActorUuids`의 alive 필터 부재(7번 항목).

---

## 2. `backend/socket/gameSession.js` (REFERENCE)

배선 변경 없음. `handleSubmitNightAction`은 `checkNightTurnGate` → `submitNightAction` →
`computeCurrentNightTurnRole` 순서로 core에 위임하므로(`:275-385`), core의 eligibility·target 규칙이
바뀌면 그대로 따라간다. 생존자 지목은 `submitNightAction`이 `INVALID_TARGET`을 반환하고 `:338-346`이
그 코드를 그대로 ack에 실어 보낸다(`INTERNAL_ONLY_CODES`에 없음). 사망자 0명인 밤에는 WITCH_HUNTER가
`computeCurrentNightTurnRole` 후보에서 빠져 `:355-367`의 자동 판정 경로로 곧장 넘어간다.

---

## 3. `backend/game-core/__tests__/gameSession.test.js` (MODIFY)

### 갱신할 기존 테스트

| 위치 | 조치 |
| --- | --- |
| `:391-397` `ROLE_DEFINITIONS` 표 | `WITCH_HUNTER.nightActionMinDayIndex`를 `1` → `0`으로 기대값 변경. 테스트 이름의 "첫날밤 비활성 정책"을 "밤 행동 유무(null=없음)"로 갱신 |
| `:399-411` 동결 테스트 | 변형 시도값 `nightActionMinDayIndex = 0`이 이제 현재값과 같아져 테스트가 무의미해진다 → `= 5` 같은 다른 값으로 바꿔 동결 검증력을 유지 |
| `:1746-1765` eligibility 표 | `(role, dayIndex)` → `(session, role)` 표로 재작성. 아래 참조 |
| `:1794-1806` self-target 루프 | `witchHunterUuid` 케이스에서 `session.dayIndex = 1` 대신 **CITIZEN 한 명을 `alive = false`로** 만들어 eligibility를 통과시킨다(그래야 `NOT_ELIGIBLE`이 아니라 의도한 `INVALID_TARGET`이 나온다) |
| `:1828-1839` "day0 NOT_ELIGIBLE / day1 가능" | 새 규칙 테스트로 교체: **사망자 0명이면 dayIndex와 무관하게 `NOT_ELIGIBLE`, 사망자가 생기면 dayIndex 0에서도 제출 성공** (요구사항의 "minDayIndex 제한 제거 확인" 검증 항목) |

새 eligibility 표(사망자 유무 축이 추가된다):

```js
const eligibilityTable = [
    ['JOKER', 0, false, true],   ['JOKER', 1, false, true],
    ['DOCTOR', 0, false, true],  ['DOCTOR', 1, false, true],
    ['GUARD', 0, false, true],   ['GUARD', 1, false, true],
    ['WITCH_HUNTER', 0, false, false], ['WITCH_HUNTER', 1, false, false],
    ['WITCH_HUNTER', 0, true, true],   // ← minDayIndex 제한이 사라졌다는 증거
    ['WITCH_HUNTER', 1, true, true],
    ['CITIZEN', 0, false, false], ['CITIZEN', 1, false, false],
    ['CITIZEN', 1, true, false],
]
// 각 케이스: commitFullRoleSessionAtNight({ id: `elig-...` })로 세션을 만들고
// session.dayIndex를 맞춘 뒤, hasDead면 citizenUuid를 alive=false로 한다.
```

### 새로 추가할 테스트 (요구사항의 검증 항목과 1:1)

1. `submitNightAction(WITCH_HUNTER)`: **사망자 지목 → `{ok:true}` + `nightActions`에 저장**
2. `submitNightAction(WITCH_HUNTER)`: **생존자 지목 → `{ok:false, code:'INVALID_TARGET'}` + Map 완전 불변**
   (기존 표의 `assert.deepEqual(session.nightActions, before)` 패턴 그대로)
3. `submitNightAction(WITCH_HUNTER)`: **사망자가 있으면 dayIndex 0에서도 제출 성공** (minDayIndex 제한 제거)
4. **반복 조사**: 같은 시신을 두 밤 연속(= 두 번 제출) 지목해도 계속 성공하고 마지막 값으로 덮어써진다
5. `computeWitchHunterConfirmationResult`: 시신을 지목한 결과가 **정확히 `{targetId, role}` 2키**이고
   `role`이 그 시신의 실제 역할이다 (현재 이 함수에 대한 테스트가 저장소에 하나도 없다 — 요구사항 3의
   "반환 형태 유지"를 고정하는 회귀 테스트를 여기서 새로 만든다)
6. `prepareNightResolution`: 사망자(CITIZEN)가 있는 밤에 JOKER/DOCTOR/GUARD/WITCH_HUNTER가 모두 제출하면
   `resolution.privateResults`의 WITCH_HUNTER 항목이 `{actionType:'CONFIRM', targetId, role}`이다
   — **죽이는 사람은 CITIZEN으로 고정한다**(0절 7번의 선재 결함 회피)
7. `hasAnyDeadPlayer`: 전원 생존 → false, 한 명 사망 → true (단위 테스트)

---

## 4. `backend/socket/__tests__/nightTurnProgression.test.js` (MODIFY)

이 파일이 순차 진행 계약을 실제 production 경로로 검증하므로 요구사항 2의 핵심 증거가 여기 모인다.

| 위치 | 조치 |
| --- | --- |
| `:138-184` "전체 canonical 순서" | 지금은 전원 생존 · dayIndex 1이라 새 규칙에서 WITCH_HUNTER가 **건너뛰어져 실패한다.** `ackAllAndRewindToNight` 직후 `session.players.get(citizenUuid).alive = false`를 넣어 조사 대상 시신을 만든다. GUARD의 대상을 `citizenUuid`(이제 시신) 대신 `doctorUuid`로 바꿔 GUARD 규칙과 무관하게 유지한다. WITCH_HUNTER는 SKIP(null) 제출을 그대로 두어 자동 판정·DAY 전이·이벤트 1건씩 기대값을 유지한다(JOKER 1 vs 시민 3 → 승리 미성립, `dayIndex` 1→2 유지) |
| `:190-216` "first-NIGHT witch skip" | **동작은 그대로 통과한다**(dayIndex 0 · 사망자 0). 다만 스킵 사유가 dayIndex가 아니라 "사망자 0명"으로 바뀌었으므로 테스트 이름과 `:197` 주석을 새 규칙 문구로 갱신한다 |
| `:222-249` "zero actor auto-skip" | 전원 생존이라 새 규칙에서 WITCH_HUNTER 턴이 안 열려 **실패한다.** 방에 `za-citizen`을 추가해 4인(JOKER/DOCTOR/WITCH_HUNTER/CITIZEN)으로 만들고 CITIZEN을 `alive = false`로 둔다. GUARD 부재 → WITCH_HUNTER로 건너뛴다는 원래 검증 의도는 그대로 유지된다 |

추가할 테스트 2개:

- **"사망자 0명인 밤(dayIndex 1)에는 WITCH_HUNTER가 건너뛰어진다"** — `:190` 테스트의 dayIndex 1 판본.
  day0 스킵이 "첫 밤이라서"가 아니라 "시신이 없어서"임을 못 박는다.
- **"dayIndex 0이어도 사망자가 있으면 WITCH_HUNTER 턴이 정상적으로 열린다"** — GUARD 제출 후
  `computeCurrentNightTurnRole === 'WITCH_HUNTER'`이고 `night_turn_changed(nightTurnRole:'WITCH_HUNTER')`가
  참가자 전원에게 정확히 1건 방송된다.
- **production 경로 거부**: WITCH_HUNTER 턴에서 생존자를 지목하면 ack가
  `{ok:false, code:'INVALID_TARGET', message:'요청을 처리할 수 없습니다.'}`이고 `session.nightActions`가
  불변이며 턴도 그대로다(`:283-314`의 거부 테스트와 같은 패턴).

---

## 5. `backend/socket/__tests__/gameSession.test.js` (REFERENCE)

`commitFullRoleSessionAtNight`가 `witchHunterUuid`를 반환하지만(`:578`) 이 파일의 어떤 테스트도 그 값을
쓰지 않는다(전 파일 grep으로 확인). WITCH_HUNTER eligibility에 의존하는 테스트가 없으므로 수정하지 않는다.
구현 단계에서 이 파일이 깨지면 그건 예상 밖 신호이니 그때 원인을 다시 볼 것.

---

## 6. 검증 절차

```powershell
cd backend
npm test            # node --env-file=.env.test --test — game-core/socket/utils 전체
```

요구사항의 검증 항목 ↔ 테스트 매핑:

| 검증 항목 | 어디서 증명되는가 |
| --- | --- |
| 사망자 지목 → 제출 성공, 결과에 시신의 role | 3절 새 테스트 1·5·6 |
| 생존자 지목 → INVALID_TARGET, nightActions 무변경 | 3절 새 테스트 2 + 4절 production 경로 거부 테스트 |
| 사망자 0명인 밤 → 턴 진행에서 건너뜀(첫 밤 포함) | 4절 `:190` 갱신본(day0) + 새 dayIndex 1 판본 |
| 사망자 발생 후 밤 → WITCH_HUNTER 턴 정상 등장 | 4절 `:138`·`:222` 갱신본 |
| day0 + 사망자 → 조사 가능(minDayIndex 제한 제거) | 3절 새 테스트 3, eligibility 표의 `['WITCH_HUNTER',0,true,true]`, 4절 day0 턴 등장 테스트 |
| 기존 backend 전체 PASS | `npm test` 전체 |

---

## 7. frontend / e2e에 미치는 영향 (수정 금지 범위 — 손대지 않음)

`e2e/lib/scenarioPlan.js`의 `witchHunterCanActOn`(`:101`)과 `witchHunterTargetSeat`(`:233`),
프런트의 `isInGameAnnounceableNightTurn` 등은 여전히 "day1부터 · 생존자 대상"이라는 옛 규칙을 갖고 있다.
이번 슬라이스 이후 **e2e 마녀사냥꾼 시나리오와 프런트 대상 목록은 백엔드와 어긋난 상태로 남는다.**
요구사항이 backend만 다루라고 명시했으므로 의도된 결과이며, 후속 슬라이스에서 맞춰야 한다. 계획상 어떤
frontend/e2e 파일도 읽기 이상으로 건드리지 않는다.

---

## 8. 무엇이 잘못될 수 있나

1. **(가장 큰 위험) 죽은 eligible 배우가 밤 판정을 영구 정지시키는 선재 결함.**
   `getEligibleNightActorUuids`가 alive를 필터하지 않아, 밤 행동이 있는 역할(JOKER/DOCTOR/GUARD/WITCH_HUNTER)
   보유자가 죽은 뒤의 밤은 `prepareNightResolution`이 항상 `ACTIONS_PENDING`이 된다(턴 진행은 alive를
   필터하므로 끝나지만, 그 끝이 자동 판정 실패로 이어진다). 이번 변경으로 **새로 생기는** 문제는 아니지만,
   WITCH_HUNTER는 이제 "누군가 죽은 밤"에만 등장하므로 이 구멍과 마주칠 확률이 구조적으로 높아진다.
   완화: 이번 슬라이스는 이 함수를 건드리지 않고(다른 역할 규칙 불변 요구), 새 테스트에서 죽이는 대상을
   항상 CITIZEN으로 고정한다. 별도 슬라이스로 올려야 할 사안임을 구현 커밋 메시지에 남긴다.

2. **`isEligibleForNightAction` 시그니처 변경 누락.** 5개 호출부 중 하나라도 옛 인자 순서로 남으면
   `session` 문자열이 role 자리에 들어가 조용히 `false`가 되어(= 그 역할이 통째로 사라져) 밤이 이상하게
   진행된다. 완화: 호출부가 정확히 5곳임을 사전에 확정해 두었고(0절 2번), 구현 후
   `rg "isEligibleForNightAction" backend`로 전수 확인한 뒤 전체 테스트를 돌린다.

3. **`ackAllAndRewindToNight` 계열 픽스처가 `alive`를 리셋하지 않는다.** 이 헬퍼들은 phase/dayIndex/
   nightActions만 되돌리므로, 테스트에서 세운 `alive = false`는 rewind 이후에도 유지된다. 이는 우리가
   원하는 동작이지만(밤을 넘겨도 시신은 남는다), rewind **전에** 죽이면 순서에 따라 헷갈릴 수 있다.
   완화: 항상 `ackAllAndRewindToNight(...)` **다음 줄에서** `alive = false`를 세운다.

4. **`:138` 테스트의 승리 조건 오작동.** CITIZEN을 하나 죽이면 진영 균형이 바뀐다. 5인 구성에서
   JOKER 1 vs 시민 3이 남으므로 `evaluateWinCondition`은 성립하지 않고 DAY(dayIndex 2) 전이 기대값이
   유지된다. 구현 시 이 가정이 깨지면(ENDED로 감) 죽이는 대상을 바꾸는 대신 참가자를 하나 늘린다.

5. **SELF_TARGET 규칙의 관측 가능한 변화.** 살아있는 WITCH_HUNTER의 자기 지목은 이제
   SELF_TARGET이 아니라 새 "대상 사망" 검사에서 걸린다. 반환 코드는 양쪽 다 `INVALID_TARGET`이라
   client 관측값은 동일하다(요구사항 5 충족). 다만 기존 self-target 테스트가 eligibility를 통과하도록
   시신을 만들어 주지 않으면 `NOT_ELIGIBLE`이 나와 실패한다 — 3절 표에 반영했다.

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | WITCH_HUNTER eligibility(사망자 존재 기반)·대상 사망 검증·hasAnyDeadPlayer 추가 |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | eligibility 표·submitNightAction·확인 결과 테스트를 새 규칙으로 갱신 및 추가 |
| MODIFY | backend/socket/__tests__/nightTurnProgression.test.js |  | 순차 진행에서의 WITCH_HUNTER 스킵·등장 시나리오 갱신 및 추가 |
| REFERENCE | backend/socket/gameSession.js |  | 밤 행동 제출·자동 판정 배선(변경 없음 확인) |
| REFERENCE | backend/socket/__tests__/gameSession.test.js |  | WITCH_HUNTER 의존 테스트 부재 확인 |
