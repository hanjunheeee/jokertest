# joker-A · 백엔드 역할·판정 국소 수정 — 구현 계획

## 0. 전제와 해석 (구현 전 확정)

읽은 코드 기준으로 요구사항을 다음과 같이 확정한다. 애매한 지점은 여기서 가정을 명시하고 그대로 진행한다.

| # | 확정 사항 | 근거 |
|---|---|---|
| A | **production 첫 밤의 dayIndex는 1이다.** `ROLE_REVEAL(dayIndex 0)` → 전원 ack → `enterDayPhase`(dayIndex 1) → DAY → `commitDayVoteResolution`이 NIGHT로 전이(dayIndex 유지 = 1). 두 번째 밤은 dayIndex 2. 따라서 WH의 `nightActionMinDayIndex`를 **1 → 2**로 바꾸는 것이 요구 2의 "값만 수정"이다. | gameSession.js:625-629, 691-694, 1321-1326, 1603-1613 |
| B | 기존 테스트 픽스처 `ackAllAndRewindToFirstNight`은 "첫 밤"을 **인위적으로 dayIndex 0**으로 되돌린다(production 순서를 흉내내지 않는다고 주석에 명시). 이 픽스처가 곧 판정 4.2.1의 버그를 가려온 원인이므로, **production 경로(dayIndex 1)를 걷는 회귀 테스트를 새로 추가**한다. | gameSession.test.js:1354-1377 |
| C | 요구 4의 "role 필드"는 **`executedRole`** 이라는 키 이름으로 추가한다. 최상위 `role` 키는 이 저장소에서 "뷰어 본인의 역할"을 뜻하는 예약된 의미이고(`buildViewerRoleFields`), 스냅샷 비밀검사기의 금지 키 목록에도 들어 있다. 값은 `executedUuid`가 가리키는 참가자의 role이고 NOT_GUILTY(처형 없음)이면 `null`이다. | gameSession.js:590-605, gameSession.test.js:3494-3498 |
| D | 요구 5의 재투표는 **새 phase를 만들지 않는다.** phase는 DAY에 머무르고 `session.dayVoteRound`(1→2)로만 구분한다 — "밤 턴 구조·타이머 수정 금지"를 지키기 위함이다. 1라운드 동점은 새 outcome **`REVOTE`**, 2라운드 동점은 기존 **`TIE`**(= 처형 없이 NIGHT)로 표현한다. 이렇게 하면 `TIE`의 기존 계약(phase NIGHT, 처형 없음)이 프런트에서 그대로 유효하다. | gameSession.js:1308-1328, useInGameActionPanel.js:44-77 |
| E | 요구 6의 상한은 **create_room 검증과 게임 시작 해석 양쪽**에 넣되, 전부 `backend/game-core/roleComposition.js` 안에서만 집행한다. `backend/utils/createRoomValidation.js`의 `ALLOWED_JOKER_COUNT = [1..4]`는 변경 범위 밖이므로 건드리지 않는다 — payload 형태 검증은 통과하고 역할 구성 검증에서 거부된다(기존 createRoomValidation 테스트 무영향). | roleComposition.js:156-230, createRoomValidation.js:8, matchmaking.js:334, 232, 806 |

## 1. 변경 파일과 변경 내용

### 1-1. `backend/game-core/gameSession.js` (요구 1·2·3·4·5)

**(a) ROLE_DEFINITIONS — 대상 생존 요구 플래그 + WH 활성 시점** (:20-26)

```
JOKER:        { team:'JOKER',   nightActionMinDayIndex: 0, targetMustBeAlive: true }
CITIZEN:      { team:'CITIZEN', nightActionMinDayIndex: null, targetMustBeAlive: true }
DOCTOR:       { team:'CITIZEN', nightActionMinDayIndex: 0, targetMustBeAlive: true }
GUARD:        { team:'CITIZEN', nightActionMinDayIndex: 0, targetMustBeAlive: true }
WITCH_HUNTER: { team:'CITIZEN', nightActionMinDayIndex: 2, targetMustBeAlive: false }
```
- 각 역할 정의는 지금처럼 개별 `Object.freeze`를 유지한다.
- 블록 주석에 "첫 밤 = dayIndex 1이므로 WH는 2부터 활성"이라는 근거(전제 A)를 남긴다. `dayIndex`의 의미·증가 지점(`enterDayPhase`)은 건드리지 않는다.

**(b) 새 헬퍼 `requiresAliveTarget(role)`** — `isEligibleForNightAction` 바로 아래(:706 인근)에 추가.
`ROLE_DEFINITIONS[role]?.targetMustBeAlive !== false`로 판정한다(기본값 true = 알 수 없는 role도 fail-closed). `__testables`에 export.

**(c) `submitNightAction` 대상 검증** (:855-872)
검증 순서 8~9번을 다음으로 교체한다:
1. 대상 참가자 존재 확인 → 없으면 `INVALID_TARGET`(그대로)
2. `requiresAliveTarget(actor.role)`가 true면 `!target.alive → TARGET_NOT_ALIVE`(그대로), false면 `target.alive → TARGET_NOT_DEAD`(**신규 공개 코드**)
3. 이후 JOKER 진영 no-op, 자기 자신 대상 거부는 순서·동작 그대로

결과: WH가 생존자를 지목하면 `TARGET_NOT_DEAD`로 거부되고 `nightActions`는 불변, 사망자를 지목하면 저장된다. WH의 자기 자신 지목은 (본인이 생존이므로) 2번에서 `TARGET_NOT_DEAD`로 걸린다 — `SELF_TARGET_ALLOWED_ROLES`는 그대로 두되, 주석에 "WH는 생존 대상 자체가 불가라 이 Set까지 도달하지 않는다"를 남긴다. 함수 docblock의 검증 순서 목록도 함께 갱신한다.

**(d) `prepareNightResolution` 대상 재검증 루프** (:930-938)
같은 규칙을 actor의 role 기준으로 적용한다 — `requiresAliveTarget(actorRole)`이면 "참가자 && alive", 아니면 "참가자 && !alive"를 요구하고 어긋나면 기존대로 `TARGET_NOT_A_PARTICIPANT`(internal-only). 이걸 빼면 WH의 사망자 지목이 그 밤 전체를 INTERNAL_ERROR로 막는다. docblock 7번 항목도 갱신한다.

**(e) 경비원 조사 결과** (:778-783)
`computeGuardInvestigationResult`가 `{ targetId, team: ROLE_TEAMS[...] }` → `{ targetId, role: targetPlayer.role }`을 반환하도록 바꾸고 주석을 갱신한다. 소켓 계층은 `...privateResult`로 그대로 실어 나르므로 변경 불필요(`night_action_result`의 키가 `team`→`role`로 바뀐다). `prepareNightResolution` docblock의 privateResults 설명도 함께 갱신한다.

**(f) 처형 공개 payload** (:1621-1632)
`buildTribunalVoteResolvedPayload`에 `executedRole` 추가:
- `tribunal.executedUuid === null` → `null`
- 아니면 `session.players.get(tribunal.executedUuid)?.role ?? null`
docblock의 "top-level 키는 정확히 [...]" 목록에 `executedRole`을 넣고, "처형된 참가자의 role은 스펙상 공개 정보(판정 6.6/8.2)"라는 근거를 남긴다. `buildSessionSnapshot`의 tribunal 필드는 이번 슬라이스에서 건드리지 않는다(요구는 처형 공개 payload 한정).

**(g) 동점 재투표** (요구 5) — 이 슬라이스에서 가장 넓은 변경

세션 필드 2개 추가(`buildSessionCandidate`, :401 인근):
- `dayVoteRound: 1` — 이 dayIndex의 투표 라운드(1 = 최초, 2 = 재투표)
- `dayVoteExcludedUuids: new Set()` — 이번 라운드에서 후보 자격이 없는 uuid

방어적 접근자 2개(모듈 내부): `getDayVoteRound(session)` = `session.dayVoteRound ?? 1`, `getDayVoteExcludedUuids(session)` = Set이면 그 값, 아니면 빈 Set. 손으로 조립한 session을 쓰는 기존 테스트(gameSession.test.js:855-870 등)가 새 필드 없이도 그대로 동작해야 한다.

- `enterDayPhase`(:625): `dayVoteRound = 1`, `dayVoteExcludedUuids = new Set()`도 함께 초기화한다 — DAY 상태 초기화의 유일한 canonical 지점이라는 기존 원칙을 지킨다.
- `assertValidSessionForCommit`(:485-492 인근): 신규 세션은 `dayVoteRound === 1`, `dayVoteExcludedUuids`가 빈 Set이어야 한다는 검사를 기존 dayVotes 검사와 같은 문체로 추가한다.
- `submitDayVote`(:1123-1157):
  - 이미 판정됨 가드를 `dayIndex 일치 && resolution.round === getDayVoteRound(session)`로 바꾼다(라운드가 넘어가면 1라운드 판정 기록이 2라운드 제출을 막지 못하게).
  - 대상 검증 순서: 존재 → 생존 → 자기 자신(`SELF_TARGET_NOT_ALLOWED`) → **제외 대상(`TARGET_EXCLUDED_FROM_REVOTE`, 신규 공개 코드)**. 실패 경로는 여전히 `dayVotes`를 건드리지 않는다. docblock 검증 순서도 갱신.
- `tallyDayVoteOutcome`(:1180-1216): 제외 집합을 함께 읽어 (1) 제외 대상을 향한 표는 기권으로 집계하고(정상 경로에선 도달 불가한 방어 규칙 — `publicVoteCount`/`publicAbstainCount` 불변식 유지), (2) 동률일 때 최다 득표 대상 전체를 `tiedTargetUuids`(정렬 배열)로 함께 반환한다.
- `prepareDayVoteResolution`(:1237-1292):
  - alreadyResolved 판정에 round 일치를 더한다.
  - resolution에 `round`, `excludedUuids`(이번 라운드 제외 목록의 정렬·동결 복사본), `revoteExcludedUuids` 추가.
  - outcome 결정: 동률 && round 1 → **`REVOTE`**(`tribunalTargetUuid: null`, `revoteExcludedUuids = tiedTargetUuids`) / 동률 && round ≥ 2 → `TIE` / 그 외 기존과 동일.
- `commitDayVoteResolution`(:1308-1328):
  - `assertSessionNotEnded` 다음에 **일관성 가드** 추가: `resolution.dayIndex !== session.dayIndex || resolution.round !== getDayVoteRound(session)`이면 아무 것도 바꾸지 않고 `{ ok:false, code:'DAY_VOTE_RESOLUTION_MISMATCH' }`. 같은 resolution의 이중 commit이 라운드를 두 번 올리고 표를 지우는 사고를 막는다.
  - `REVOTE`: `dayVoteResolution = resolution`, `tribunal = null`, **phase는 DAY 유지**, `dayVoteRound = resolution.round + 1`, `dayVoteExcludedUuids = new Set(resolution.revoteExcludedUuids)`, `dayVotes = new Map()`.
  - `TRIBUNAL` / `TIE` / `ABSTAINED`: 기존 동작 그대로(TIE·ABSTAINED는 NIGHT 전이 + nightActions/nightResolution 리셋). round/excluded는 다음 `enterDayPhase`가 되돌린다.
  - docblock에 재투표 분기를 서술한다.
- `buildDayVoteResolvedPayload`(:1334-1344): `round`, `revoteExcludedUuids`(매 호출 새 배열 복사) 추가. 기존 키는 그대로.
- `buildSessionSnapshot`(:1714-1721): `fields.dayVoteResolution`에 `round`, `revoteExcludedUuids`를 함께 담는다 — 재접속 클라이언트가 "재투표가 열려 있고 누가 후보에서 빠졌는지"를 알 수 없으면 DAY에 갇힌다.
- `__testables`에 `requiresAliveTarget`, `getDayVoteRound`, `getDayVoteExcludedUuids`를 추가(기존 export는 하나도 제거하지 않는다).

**종결성**: 1라운드 동점 → 동점자 제외 2라운드 → 2라운드 동점이면 `TIE`(NIGHT). 동점자가 생존자 전원이면 2라운드는 후보 0명이라 전원 기권 → `ABSTAINED`(NIGHT). 어느 경로도 3라운드로 가지 않는다.

### 1-2. `backend/game-core/roleComposition.js` (요구 6 · 백엔드)

- `const MAX_SPECIAL_ROLE_COUNT = 2` 신설 + export. 주석: 광대·의사·경비원·마녀사냥꾼 공통 상한이며 CITIZEN은 잔여 인원이라 상한이 없다(정원 10명, 시민 0명 허용).
- `validateCustomRoleCounts`: 기존 `JOKER >= slotCount` 검사 **다음**, `FIXED_ROLES_EXCEED_SLOTS` **앞**에 4개 키 전체에 대해 `> MAX_SPECIAL_ROLE_COUNT` → `{ ok:false, reason:'ROLE_COUNT_ABOVE_LIMIT' }`를 넣는다. 이 위치여야 기존 `JOKER:4/slot:4 → JOKER_COUNT_TOO_HIGH` 계약이 그대로 유지된다.
- `CREATE_ROOM_ROLE_COMPOSITION_MESSAGES`에 `ROLE_COUNT_ABOVE_LIMIT` 메시지 추가(`MAX_SPECIAL_ROLE_COUNT`로 문자열 조립).
- `validateCreateRoomRoleComposition`의 **AUTO 분기**: `baseSettings.jokerCount > MAX_SPECIAL_ROLE_COUNT`면 같은 메시지로 거부한다(AUTO는 roleCounts가 없어 jokerCount가 유일한 상한 대상이다).
- `resolveRoleComposition`의 **AUTO 분기**: `JOKER_COUNT_TOO_HIGH` 검사 **다음**에 `storedJokerCount > MAX_SPECIAL_ROLE_COUNT` → `reason:'ROLE_COUNT_ABOVE_LIMIT'`. "저장된 값을 신뢰하지 않는다"는 이 모듈의 원칙대로 시작 시점에도 재검증한다.
- CUSTOM은 두 경로 모두 `validateCustomRoleCounts`를 거치므로 추가 작업이 없다. 시민 수는 어떤 분기에서도 거부 사유가 아니다(파생값이라 입력 자체가 없다).

### 1-3. `frontend/src/domains/game/setup/constants/roleComposition.js` (요구 6 · 프런트 상한 상수)

- `export const MAX_SPECIAL_ROLE_COUNT = 2` 신설 — 백엔드 `roleComposition.js`의 동명 상수와 수동 동기화(이 파일 상단 주석의 기존 관례 그대로).
- `MAX_CUSTOM_JOKER_COUNT = MAX_SPECIAL_ROLE_COUNT` (4 → 2). 주석을 갱신한다: 서버가 AUTO/CUSTOM 모두 2명 상한을 집행하며, `backend/utils/createRoomValidation.js`의 `ALLOWED_JOKER_COUNT`(1~4)는 payload 형태 검증일 뿐 역할 구성 검증이 3 이상을 거부한다는 사실을 적는다.
- `DEFAULT_CUSTOM_ROLE_COUNTS`(JOKER 1)는 그대로 — 새 상한 안이다.

이 한 값의 변경만으로 `validateRoleComposition`의 `JOKER_COUNT_ABOVE_LIMIT`와 `getRoleCountRange("JOKER", …)`가 즉시 2로 좁혀진다(둘 다 이 상수를 import한다).

## 2. 테스트 (기존 관례: `node:test` + `assert/strict`, 파일당 평서문 한국어 테스트명)

### 2-1. `backend/game-core/__tests__/gameSession.test.js`

**추가**
- WH 대상 규칙: 사망자 지목 → `{ok:true}` + `nightActions`에 저장 / 생존자 지목 → `TARGET_NOT_DEAD` + Map 불변 / 자기 자신 지목 → `TARGET_NOT_DEAD`. (판정 4.2.2)
- `requiresAliveTarget` 표 테스트: 5개 역할 × 기대값(WH만 false) + 알 수 없는 role → true(fail-closed).
- WH 사망자 지목이 `prepareNightResolution`을 막지 않고 `privateResults`에 `{actionType:'CONFIRM', targetId, role}`을 만든다.
- **production 경로 첫 밤 회귀 테스트**(판정 4.2.1): ROLE_REVEAL 전원 ack → DAY(dayIndex 1) → 전원 투표/기권 → prepare/commit으로 NIGHT(dayIndex 1) 진입 → WH 제출이 `NOT_ELIGIBLE`. 이어서 dayIndex 2인 밤에서는 허용됨을 확인.
- `isEligibleForNightAction` 표에 dayIndex 2 열 추가(WH: 0 false, 1 false, 2 true).
- GUARD 조사 결과에 `role`이 담기고 `team` own-property가 없다(판정 4.3.1). DOCTOR·CITIZEN을 각각 지목했을 때 실제 role이 그대로 나오는지 확인.
- 처형 payload: GUILTY → `executedRole`이 피고인의 실제 role, NOT_GUILTY → `executedUuid`/`executedRole` 모두 null(판정 6.6/8.2).
- 재투표(판정 6.4/6.5), 4인 이상 DAY 픽스처를 새로 만들어:
  1. 1라운드 동점 → outcome `REVOTE`, phase는 DAY 유지, `dayVoteRound`가 2, `dayVoteExcludedUuids`가 동점자 집합, `dayVotes`가 빈 Map.
  2. 재투표 중 동점자였던 플레이어에게 투표 → `TARGET_EXCLUDED_FROM_REVOTE` + `dayVotes` 불변.
  3. 재투표에서 단독 최다 → `TRIBUNAL` 전이(기존 계약과 동일).
  4. 재투표도 동점 → outcome `TIE`, phase NIGHT, 아무도 죽지 않음(생존 상태 전후 동일).
  5. 재투표 라운드에서 동점자 전원이 제외돼 후보가 없으면 전원 기권 → `ABSTAINED` → NIGHT.
  6. 같은 resolution을 두 번 commit하면 두 번째는 `DAY_VOTE_RESOLUTION_MISMATCH`이고 라운드·표가 안 바뀐다.
  7. 스냅샷: 재투표 진행 중 `dayVoteResolution.round === 1`, `revoteExcludedUuids`가 노출되고, 비밀검사기(`assertNoForbiddenPrivateData`)를 그대로 통과한다.
- 역할 상한: 어떤 특수직업도 3명으로는 세션을 시작할 수 없다(`prepareGameSession` → `INVALID_ROLE_COMPOSITION:ROLE_COUNT_ABOVE_LIMIT`). AUTO(jokerCount 3)·CUSTOM(DOCTOR 3) 양쪽. (판정 2.2)

**수정(기존 테스트가 새 계약과 충돌하는 지점 — 전부 확인된 목록)**
- :1415-1432 `eligibilityTable`의 `['WITCH_HUNTER', 1, true]` → false, dayIndex 2 행 추가.
- :1461-1473 GUARD/WH 자기 자신 지목 루프 — WH는 `dayIndex = 2`로 올리고 기대 코드를 `TARGET_NOT_DEAD`로 바꾼다(GUARD는 `INVALID_TARGET` 그대로).
- :1495-1506 "WH는 dayIndex 0에 NOT_ELIGIBLE, 1부터 가능" → "1까지 NOT_ELIGIBLE, 2부터 가능"으로 갱신.
- :1191-1212 `buildGameStartedPayload` allies 테스트의 `jokerCount: 3` → `2`(5인 방). allies 집합 계약 검증은 그대로 유지.
- :2810-2833 / :2930-2942 3인 순환 투표 TIE 테스트 — 새 규칙에서는 1라운드가 `REVOTE`가 되므로, (a) 1라운드 REVOTE를 검증하는 테스트와 (b) 2라운드까지 진행해 `TIE`/phase NIGHT/payload를 검증하는 테스트로 나눠 다시 쓴다.
- :2902-2915 사망자 제외 집계 테스트 — outcome 기대값을 `REVOTE`로 갱신(집계 수치 계약은 그대로).
- :3280-3303 처형 payload 화이트리스트 — 키 목록에 `executedRole` 추가, `JSON.stringify(...).includes('role')` 단정은 "타인의 role이 새지 않는다"(처형자 본인 role만 노출)로 다시 쓴다. `ballotSnapshot`/`voterUuid` 미포함 단정은 유지.
- ROLE_DEFINITIONS 동결 테스트(:249-251)에 `targetMustBeAlive` 재할당 불가 단정을 한 줄 더한다.

### 2-2. `backend/game-core/__tests__/roleComposition.test.js`

- 추가: 4개 역할 각각 3명 → `ROLE_COUNT_ABOVE_LIMIT`(`validateCustomRoleCounts`), 2명은 통과 / AUTO create_room의 jokerCount 3 → 상한 메시지로 거부 / `resolveRoleComposition` AUTO의 jokerCount 3(인원 8) → `ROLE_COUNT_ABOVE_LIMIT` / `MAX_SPECIAL_ROLE_COUNT === 2` export 확인.
- 기존 :78(`JOKER:4/slot:4 → JOKER_COUNT_TOO_HIGH`), :117, :169, :186은 검사 순서를 그대로 두었으므로 **변경 없이 통과**해야 한다. 실행으로 확인한다.

### 2-3. `frontend/src/domains/game/setup/utils/__tests__/roleComposition.test.js`

상수를 import하는 `validateRoleComposition`/`getRoleCountRange`의 기대값이 바뀌므로 갱신한다(확인된 3곳):
- :55-67 `roleCounts = { JOKER: 3, … }` → JOKER 2 기준으로 다시 쓰고, JOKER 3은 `JOKER_COUNT_ABOVE_LIMIT`로 거부됨을 검증하는 케이스를 추가.
- :90-94 `JOKER:4/maxPlayers:4` → 상한 검사가 먼저 걸리므로, `JOKER_COUNT_TOO_HIGH`를 계속 검증하려면 `JOKER:2/maxPlayers:2`로 바꾼다.
- :133-134 `getRoleCountRange("JOKER", 10) → {min:1,max:2}`, `("JOKER", 4) → {min:1,max:2}`.
- 추가: `MAX_SPECIAL_ROLE_COUNT === 2`이고 `MAX_CUSTOM_JOKER_COUNT`와 같은 값이다.

## 3. 검증 방법

```
# backend (repo/backend 에서)
node --test game-core/__tests__/gameSession.test.js game-core/__tests__/roleComposition.test.js
node --test socket/__tests__/gameSession.test.js socket/__tests__/matchmaking.test.js
node --test utils/__tests__/createRoomValidation.test.js

# frontend (repo/frontend 에서)
node --experimental-test-module-mocks --test src/domains/game/setup/utils/__tests__/roleComposition.test.js
node --experimental-test-module-mocks --test src/domains/game/setup/utils/__tests__/buildCreateRoomPayload.test.js
node --experimental-test-module-mocks --test src/domains/game/ingame/store/__tests__/applySessionSnapshot.test.js
```
`npm run test:game-core --prefix backend`도 동일 범위를 돈다. 소켓 테스트는 `.env.test`가 필요하면 `npm test --prefix backend`로 대체한다. **판정 기준은 "새 테스트 통과"가 아니라 위 6개 파일 전부가 green인 것**이다 — 특히 socket/matchmaking 테스트는 이번 변경이 payload·code 통과 경로를 깨지 않았다는 유일한 증거다.

## 4. 위험 요소와 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| `REVOTE` outcome을 현재 프런트가 모른다 | `parseDayVoteResolvedPayload`가 `DAY_VOTE_RESOLVED_OUTCOMES`/`phase` 검사에서 null을 돌려 방송을 **조용히 무시**한다(크래시는 없고 phase도 DAY 그대로라 상태 불일치는 아니다). 다만 재투표 UI 안내가 없고, 클라이언트의 "이미 투표함" 로컬 상태가 남아 재투표 제출이 막힐 수 있다 | 프런트 인게임 파일은 이번 변경 범위 밖이다. 서버 계약(`round`·`revoteExcludedUuids`를 payload와 스냅샷에 모두 실음)을 먼저 확정해 후속 프런트 슬라이스가 바로 붙을 수 있게 한다. **미완결 항목으로 §5에 명시** |
| WH 대상 규칙을 `submitNightAction`에만 넣고 `prepareNightResolution`에 안 넣으면 | WH의 사망자 지목이 그 밤 전체를 `TARGET_NOT_A_PARTICIPANT`(→INTERNAL_ERROR)로 잠근다 | 1-1(d)에서 두 곳을 같은 헬퍼로 동시에 고친다. 테스트로 고정 |
| 라운드 도입으로 `resolve_day_vote`의 멱등성 창이 좁아진다 | 1라운드 판정 직후 도착한 중복 요청은 `alreadyResolved` 성공이 아니라 `ACTIONS_PENDING`(2라운드 표 미제출)을 받는다 | 의도된 동작이다(라운드가 다르면 다른 판정이다). 소켓 계층은 이미 이 코드를 정상 실패로 응답하고, 테스트로 명시 고정한다 |
| 같은 resolution 이중 commit | 라운드가 두 번 오르고 표가 두 번 지워질 수 있다 | commit에 dayIndex+round 일관성 가드(`DAY_VOTE_RESOLUTION_MISMATCH`) 추가 + 테스트 |
| AUTO jokerCount 상한을 `resolveRoleComposition`에도 넣으면 | 기존 테스트 1건(gameSession.test.js:1191, jokerCount 3)이 깨진다 | 확인된 유일한 케이스다. §2-1에서 jokerCount 2로 갱신한다. 소켓/매치메이킹 테스트는 전부 jokerCount 1~2라 무영향(확인함) |
| `executedRole` 추가로 비밀 유출 | 처형자의 role은 스펙상 공개(판정 6.6/8.2). 스냅샷에는 넣지 않으므로 스냅샷 비밀검사기와 충돌하지 않는다 | 기존 `includes('role')` 단정만 "타인 role 미유출"로 정밀화 |
| 프런트 상한 상수만 바꾸면 UI가 완전히 정합하지 않는다 | AUTO 탭의 `joker-count` 스테퍼(max 4)와 CUSTOM의 DOCTOR/GUARD/WH 스테퍼(max = 정원)는 여전히 3 이상을 고를 수 있고, 서버가 거부 메시지를 돌려준다 | 변경 범위 밖이라 손대지 않는다. **미완결 항목으로 §5에 명시** |

## 5. 이번 슬라이스에서 의도적으로 하지 않는 것

요구의 "변경 범위: backend/game-core/gameSession.js, backend/game-core/roleComposition.js, frontend 상한 상수 파일만"을 그대로 지킨다. 그 결과 다음 두 가지가 남는다 — 둘 다 **서버 판정은 스펙대로 동작하지만 UI가 아직 못 따라오는** 상태이며, 후속 슬라이스 대상이다.

1. **재투표 UI**: `frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js`의 `DAY_VOTE_RESOLVED_OUTCOMES`/`DAY_VOTE_RESOLVED_PHASES`에 `REVOTE`(phase DAY)를 추가하고, 재투표 시작 시 로컬 투표 상태를 리셋하며 제외된 후보를 비활성화해야 한다. 자동 기권을 넣는 타이머 연동도 여기에 속한다(이번 요구에서 타이머는 수정 금지).
2. **역할 인원 스테퍼 상한**: `frontend/src/domains/game/setup/constants/gameSetupOptions.js`의 `joker-count` max(현재 4)와 `frontend/src/domains/game/setup/utils/roleComposition.js`의 `getRoleCountRange`(JOKER 외 역할이 정원까지 열려 있음)를 새 `MAX_SPECIAL_ROLE_COUNT`로 좁혀야 UI에서 3 이상을 아예 고를 수 없게 된다. 지금은 고를 수는 있으나 서버가 거부한다.

또한 밤 턴 구조·타이머·채팅·접속 끊김 처리와 승리 판정식(`>=`)은 손대지 않는다.

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | targetMustBeAlive 플래그·WH minDayIndex 2·경비원 role 결과·처형 executedRole·동점 재투표(라운드/제외 집합) |
| MODIFY | backend/game-core/roleComposition.js |  | 특수직업 2명 상한(MAX_SPECIAL_ROLE_COUNT) — create_room 검증과 시작 시 해석 양쪽 |
| MODIFY | frontend/src/domains/game/setup/constants/roleComposition.js |  | 프런트 상한 상수 통일(MAX_SPECIAL_ROLE_COUNT=2, MAX_CUSTOM_JOKER_COUNT 4→2) |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | 6건 신규 계약 테스트 + 기존 WH/TIE/처형 payload/allies 테스트 갱신 |
| MODIFY | backend/game-core/__tests__/roleComposition.test.js |  | 역할 상한 거부·통과 테스트 추가 |
| MODIFY | frontend/src/domains/game/setup/utils/__tests__/roleComposition.test.js |  | 상한 2 기준으로 검증·스테퍼 범위 기대값 갱신 |
| REFERENCE | backend/socket/gameSession.js |  | privateResult 전달·internal-only 코드 집합·day_vote_resolved 방송 경로 무변경 확인 |
| REFERENCE | backend/socket/matchmaking.js |  | validateCreateRoomRoleComposition/resolveRoleComposition 호출부 영향 확인 |
| REFERENCE | backend/utils/createRoomValidation.js |  | ALLOWED_JOKER_COUNT는 손대지 않는다는 경계 확인 |
| REFERENCE | frontend/src/domains/game/setup/utils/roleComposition.js |  | 상수 소비처(검증 메시지·스테퍼 범위) — 테스트 기대값 변경 근거 |
| REFERENCE | frontend/src/domains/game/ingame/hooks/useInGameActionPanel.js |  | day_vote_resolved 파서 계약 — REVOTE 미대응 범위 확인 |
