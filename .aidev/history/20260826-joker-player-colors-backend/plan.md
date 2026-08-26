# 참가자 색상 배정 (backend) — 구현 계획

## 1. 현재 코드 확인 결과

**색의 원천이 될 자리**
- `backend/game-core/gameSession.js:478` `buildSessionCandidate` — 역할 배정(`assignRoles`)과 `session.players` Map 생성이 모두 여기서 일어난다. "역할 배정과 같은 시점"은 정확히 이 지점이다.
- `backend/game-core/gameSession.js:397` `fisherYatesShuffle(items, randomFn)` — 이미 존재하는 순수 셔플. 색 배정도 이 함수를 그대로 재사용하면 "participants 셔플과 동일한 randomFn 주입" 요건이 구조적으로 충족된다.
- `assignRoles`(423)는 `DEBUG_FIXED_ROLES`가 켜지면 셔플을 건너뛴다. 따라서 색 배정을 `assignRoles` **안**에 넣으면 요구사항 3(플래그와 무관하게 항상 셔플)을 어긴다 → 색 배정은 `assignRoles` 바깥, `buildSessionCandidate`에서 별도 호출한다.

**colorIndex를 실어야 할 payload 3곳**
- `buildGameStartedPayload`(763) — `players: [...].map(({uuid, nickname}) => ...)`
- `buildSessionSnapshot`(1846) — `players: [...].map(({uuid, nickname, alive}) => ({uuid, nickname, isAlive}))`
- `buildEndedRoleReveals`(261) — `{uuid, nickname, role, team, alive}`. `buildTerminalFields`(285)와 `buildSessionSnapshot`(1905)이 둘 다 이 함수 하나만 부르므로 여기 한 곳만 고치면 방송본·재접속본이 자동으로 같아진다.

**손대지 않아도 되는 곳(확인 완료)**
- `backend/socket/gameSession.js:1448` — snapshot roster에 `{...player, isConnected}`로 spread만 하므로 colorIndex가 자동 전파된다.
- `backend/socket/matchmaking.js:872` — `gameSession.buildGameStartedPayload`를 그대로 호출한다.
- `buildTerminalFields.players`(288, `{uuid,isAlive}`)는 요구사항 목록에 없으므로 그대로 둔다(같은 payload의 `winResult.reveals`가 색을 싣는다).

**비밀 검사기 영향 분석**
- `backend/game-core/__tests__/gameSession.test.js:3544` `FORBIDDEN_PRIVATE_KEYS`에 `colorIndex`는 없고, 값 비교는 `typeof value === 'string'`일 때만 수행된다. colorIndex는 number라 검사기를 그대로 통과한다(색은 전원 공개 정보라는 요구사항과 일치).
- `backend/socket/__tests__/gameSession.test.js:2448` `assertRoleTeamOnlyInsideReveals`의 금지 substring은 `'"role"'/'"team"'/'"allies"'/...`뿐이라 무영향.

**깨질 기존 단정(정확 키 집합) — 전수 조사**
| 위치 | 현재 단정 |
| --- | --- |
| `backend/game-core/__tests__/gameSession.test.js:1120` | snapshot players 원소 = `['isAlive','nickname','uuid']` |
| 같은 파일 `:3677` | 동일 |
| 같은 파일 `:3260` | game_started players 원소 = `['nickname','uuid']` |
| 같은 파일 `:4243` | 동일 |
| 같은 파일 `:3385` | reveal 원소 = `['alive','nickname','role','team','uuid']` |
| 같은 파일 `:3353` `expectedRevealsOf` | reveals 기대값 생성기(deep-equal 비교에 쓰임) |
| 같은 파일 `:3390` | jokerReveal `deepEqual` 리터럴 |
| `backend/socket/__tests__/gameSession.test.js:2433` `expectedRevealsOf` | reveals 기대값 생성기 |

그 외 `Object.hasOwn(player,'role')===false` 류, top-level 키 집합 단정, `JSON.stringify(...).match(/"role"/g).length===1`(matchmaking.test.js:1257)은 colorIndex 추가에 영향받지 않는다.

**의도적으로 하지 않는 것**
- `assertValidSessionForCommit`(570)에 colorIndex 필수 검사를 추가하지 않는다. 같은 파일 테스트의 `validSession()` 픽스처(1136~1244)가 colorIndex 없는 session을 손으로 조립해 commit 경계를 검증하므로, 필수화하면 그 회귀 스위트 전체가 무관한 이유로 깨진다. `roleComposition === undefined`를 관용하는 기존 방어 스타일과도 일관된다.

## 2. 변경 내용

### 2.1 `backend/game-core/gameSession.js`

**(a) 상수 추가** — `MAX_SUPPORTED_PLAYERS`(36) 근처

```js
// 참가자 색상 팔레트의 크기. 실제 색상값(hex)은 프런트 소관이고 backend는 "몇 번째 색인가"
// (0..PLAYER_COLOR_COUNT-1)만 canonical하게 배정한다.
const PLAYER_COLOR_COUNT = 10
```

**(b) 새 순수 함수 `assignPlayerColors(players, randomFn = Math.random)`** — `fisherYatesShuffle`/`assignRoles` 바로 뒤(현재 439행 다음)에 둔다. `fisherYatesShuffle`를 재사용해야 하므로 그 아래여야 한다.

- 팔레트 인덱스 `[0..PLAYER_COLOR_COUNT-1]`를 `fisherYatesShuffle`로 섞은 뒤 `players[i] → palette[i % PLAYER_COLOR_COUNT]`를 얹은 **새 배열/새 원소**를 반환한다(원본 미변형 — `assignRoles`와 동일한 계약).
- 인원 ≤ 팔레트 크기에서는 `i % 10`이 항등이라 중복이 구조적으로 불가능하고, 인원 > 팔레트에서는 순환 배정된다(정상 경로는 `validateSessionInput`의 2~10명 제한 때문에 도달 불가이지만, 이 함수는 호출자를 신뢰하지 않는다는 파일 원칙에 따라 스스로 정의된 동작을 갖는다).
- role/team을 전혀 읽지 않는다 — 색은 역할과 독립이다.

**(c) `buildSessionCandidate`(478) 호출부**

```js
const assigned = assignRoles(players, resolved.composition, randomFn)
// 색은 역할과 독립이고 DEBUG_FIXED_ROLES와도 무관하다 — 고정 역할 배정 경로에서도 항상 셔플된다.
const colored = assignPlayerColors(assigned, randomFn)
...
players: new Map(colored.map((p) => [p.uuid, p])),
```
`randomFn`이 `undefined`로 넘어오면 기본값 `Math.random`이 적용된다(`assignRoles`와 동일). 색 배정이 `randomFn`을 추가로 소비하지만 역할 배정이 먼저 끝나므로 기존 역할 결과는 그대로다.

**(d) payload 빌더 3곳에 colorIndex 추가**
- `buildGameStartedPayload`(771): `.map(({ uuid, nickname, colorIndex }) => ({ uuid, nickname, colorIndex }))` — 주석에 "role은 없지만 colorIndex는 전원 공개 정보"임을 명시.
- `buildSessionSnapshot`(1852): `isAlive`와 나란히 `colorIndex` 추가.
- `buildEndedRoleReveals`(262): `{ uuid, nickname, colorIndex, role, team, alive }`.
- 세 함수의 JSDoc/주석에 "colorIndex는 비밀 정보 규칙 대상이 아니다(전원 공개)"를 한 줄씩 추가.

**(e) export** — `__testables`(2349)에 `assignPlayerColors`, `PLAYER_COLOR_COUNT` 추가. 공개 API(`module.exports` 최상위)는 넓히지 않는다(`NIGHT_TURN_ROLE_ORDER` 등과 같은 취급).

### 2.2 `backend/game-core/__tests__/gameSession.test.js`

**기존 단정 갱신**(위 표의 8곳): 정렬된 키 배열에 `'colorIndex'` 추가, `expectedRevealsOf`에 `colorIndex: p.colorIndex` 추가, `jokerReveal` deep-equal 리터럴에 `colorIndex: session.players.get(jokerUuid).colorIndex` 추가.

**새 테스트 — 배정 단위(`__testables.assignPlayerColors` 직접 호출)**
1. 5인: 전원 colorIndex가 정수이고 `0..9` 범위이며 `new Set(...).size === 5`(중복 없음).
2. 10인: 동일 + `new Set(...).size === 10`이고 실제로 0~9 전체를 정확히 한 번씩 쓴다.
3. 결정성: 같은 `sequenceRandom([...])` 시퀀스를 두 번 주면 배정 결과가 완전히 동일하고, 다른 시퀀스(`()=>0` vs `()=>0.999`)면 팔레트 순열이 달라진다.
4. 팔레트 초과 방어: 12인(순수 함수 직접 호출)에서 throw 없이 순환 배정되어 `colorIndex[i] === colorIndex[i % 10]`이 성립하고 모든 값이 `0..9` 범위다.
5. 원본 미변형: 입력 배열 원소에 `colorIndex` own-property가 생기지 않고, 반환 배열은 새 객체다.

**새 테스트 — 세션 배정**
6. `buildSessionCandidate`(10인)의 `session.players` 전원이 겹치지 않는 colorIndex를 갖는다.
7. `withFixedRoles('JOKER,CITIZEN,...', ...)`로 `DEBUG_FIXED_ROLES`를 켠 채 `buildSessionCandidate`를 돌려도 (a) 역할은 고정 배정 그대로이고 (b) colorIndex는 전원 배정·중복 없음이며 (c) `randomFn`을 바꾸면 색 배정이 실제로 달라진다 → 요구사항 3의 직접 검증.

**새 테스트 — payload**
8. `buildGameStartedPayload`: `state.players` 전원에 colorIndex own-property가 있고 canonical `session.players`의 값과 일치하며, **viewer가 누구든 동일한 색 목록**이 나온다(창마다 다른 색 문제의 회귀 가드). 기존 role/team 비밀 단정도 함께 유지.
9. `getSessionSnapshotForPlayer`: `players[]` 전원에 colorIndex가 있고 canonical 값과 일치하며, `assertNoForbiddenPrivateData`를 그대로 통과한다.
10. ENDED: `buildTerminalFields(session).winResult.reveals`와 `buildSessionSnapshot(...).winResult.reveals` 양쪽 모두 전원 colorIndex를 담고 서로 deep-equal이다(방송본 = 재접속본).

### 2.3 `backend/socket/__tests__/gameSession.test.js`

`expectedRevealsOf`(2433)에 `colorIndex: p.colorIndex` 추가. 이 헬퍼는 `night_result_applied`·`tribunal_vote_resolved` 종료 방송의 reveals를 deep-equal 비교하는 4곳(2507/2557/3170/3227 등)에서 쓰이므로, 이 한 줄로 소켓 계층 종료 payload 검증이 colorIndex까지 함께 단정하게 된다. 그 외 수정 없음.

## 3. 검증

```
npm test --prefix backend          # node --env-file=.env.test --test (backend 전체)
npm run test:game-core --prefix backend   # game-core 스위트만 빠르게
```

통과 기준
- 신규 배정 테스트(5인/10인 중복 없음, 결정성, 팔레트 초과 순환) PASS
- game_started·스냅샷·reveals에 colorIndex가 실린다는 payload 테스트 PASS
- `assertNoForbiddenPrivateData` / `assertRoleTeamOnlyInsideReveals` 등 기존 비밀 검사기 PASS
- `backend/**` 기존 테스트 전체 PASS (수정한 8곳의 정확 키 단정 포함)
- `frontend/**`, `e2e/**` 무수정 — `git status`로 확인

## 4. 위험 요소

| 위험 | 대응 |
| --- | --- |
| 정확 키 집합 단정 8곳이 깨진다 | 위에서 전수 조사해 목록화했다. 구현 시 그 목록만 갱신하고, 누락 시 테스트가 즉시 잡는다 |
| `assertValidSessionForCommit`에 colorIndex 필수화 유혹 | 하지 않는다(§1 마지막). `validSession()` 픽스처 다수가 colorIndex 없이 commit 경계를 검증한다 |
| 색 배정을 `assignRoles` 안에 넣으면 DEBUG_FIXED_ROLES에서 색이 고정된다 | 배정 지점을 `buildSessionCandidate`로 두고, 플래그를 켠 상태의 전용 테스트(#7)로 고정한다 |
| `randomFn` 소비량이 늘어 기존 결정적 테스트가 흔들릴 가능성 | 역할 배정이 먼저 끝난 뒤 색을 배정하므로 역할 결과는 불변. 상수 `randomFn`(`()=>0`, `()=>0.999`)은 영향 없고, 유일한 시퀀스 주입 테스트(4135)의 `sequenceRandom`은 마지막 값으로 클램프되어(`test.js:78`) 추가 호출도 결정적이다 |
| 손으로 조립된 session(테스트 픽스처)이 payload를 타면 `colorIndex: undefined`가 실린다 | 정상 경로는 항상 `buildSessionCandidate`를 거친다. JSON 직렬화에서 undefined 키는 사라지고 검사기도 number/문자열만 보므로 기존 테스트에 영향 없음 |
| 프론트가 모르는 필드를 받는다 | 추가 전용(additive) 변경이라 기존 프론트 파싱은 그대로 동작한다. 팔레트(hex)와 소비는 후속 frontend 슬라이스 몫 |
| e2e 스위트가 payload 모양에 의존 | 수정 금지 대상이며 이번 검증 범위 밖. 변경이 additive라 기존 e2e 단정을 깨지 않는다 |

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | PLAYER_COLOR_COUNT·assignPlayerColors 추가, buildSessionCandidate에서 색 배정, game_started·스냅샷·reveals 빌더에 colorIndex 포함, __testables export |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | 배정 단위·payload 테스트 추가, 정확 키 집합 단정 8곳 갱신 |
| MODIFY | backend/socket/__tests__/gameSession.test.js |  | expectedRevealsOf에 colorIndex 반영(종료 방송 reveals deep-equal) |
| REFERENCE | backend/socket/gameSession.js |  | snapshot roster enrichment가 spread라 무수정임을 확인 |
| REFERENCE | backend/socket/matchmaking.js |  | game_started payload 생성이 core 빌더 위임임을 확인 |
| REFERENCE | backend/socket/__tests__/matchmaking.test.js |  | game_started 비밀 단정이 colorIndex에 영향받지 않음을 확인 |
