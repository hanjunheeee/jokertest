# ENDED 시 전원 역할 공개 (backend) — 구현 계획

## 1. 현재 코드 확인 결과 (실제로 읽은 것)

**`backend/game-core/gameSession.js`**
- `ROLE_TEAMS` (31행): `ROLE_DEFINITIONS`에서 파생된 `{JOKER:'JOKER', CITIZEN:'CITIZEN', DOCTOR:'CITIZEN', GUARD:'CITIZEN', WITCH_HUNTER:'CITIZEN'}` frozen 객체.
- `finalizeGameSession` (237행): `session.phase='ENDED'` + `session.winResult = { winner }`. canonical `session.winResult`는 **항상 `{winner}` 단일 키**다(테스트 3117행이 이를 고정하고 있음). 이번 작업은 canonical을 건드리지 않고 **payload 빌더에서만** 확장한다.
- `buildTerminalFields` (253–260행):
  ```js
  const fields = {
      phase: session.phase,
      players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, isAlive: alive })),
  }
  if (session.winResult) fields.winResult = { ...session.winResult }
  ```
  주의: 요구사항 본문은 `players[{uuid, alive}]`라고 적었지만 **실제 코드는 `isAlive`** 다. "기존 키 유지"가 상위 규칙이므로 `players`는 손대지 않는다(계약 변경 금지).
- `buildSessionSnapshot` (1708–1765행): 1698–1707행 doc 주석에 "다른 참가자의 role/team/allies…는 어디에도 포함하지 않는다"가 있고, 1762행에서 `if (session.winResult) fields.winResult = { ...session.winResult }`로 동일한 얕은 복사를 한다. 여기가 요구사항 3의 "1704줄 부근"이다.
- `buildViewerRoleFields` (590행)가 `ROLE_TEAMS[viewer.role]`을 쓰는 유일한 role/team 노출 지점 — reveals는 이와 별개의 두 번째 공개 지점이 된다.

**`backend/socket/gameSession.js`** — 소켓 계층은 `buildTerminalFields(prepared.session)`의 결과를 그대로 spread할 뿐이다(804–811행 밤 경로, 1220–1225행 재판 경로). **수정 불필요**: 빌더만 고치면 두 broadcast 모두 자동으로 reveals를 싣는다. broadcast 순서·ACK 계약은 전혀 손대지 않는다.

**깨지는 기존 테스트 (반드시 함께 고쳐야 함)** — 이번 변경은 payload 계약을 의도적으로 넓히므로 아래 단정들이 실패한다:

| 파일 | 행 | 실패 사유 |
| --- | --- | --- |
| game-core 테스트 | 3237–3287 `assertNoForbiddenPrivateData` | `'role'`/`'team'`이 `FORBIDDEN_PRIVATE_KEYS`라 `winResult.reveals[*].role`에서 즉시 fail. 값 비교도 타인 role과 일치해 fail |
| game-core 테스트 | 3437, 3483, 3594 | ENDED 스냅샷 `deepEqual(winResult, {winner})` |
| socket 테스트 | 3268–3305 동일 검사기 | 위와 동일 |
| socket 테스트 | 2476, 2520, 3121, 3173 | terminal payload `deepEqual(winResult, {winner})` |
| socket 테스트 | 2489, 2529, 3129, 3181 | `JSON.stringify(payload)`에 `'"role"'`/`'"team"'`이 없어야 한다는 substring 검사 |
| socket 테스트 | 3540, 3625 | ENDED 스냅샷 ack `deepEqual(winResult, {winner})` |

깨지지 않는 것(확인 완료): 모든 top-level 키 집합 단정(reveals는 `winResult` 하위라 top-level 불변), `session.winResult` 자체를 보는 단정(3116/3117/3172 등 canonical 불변), `nightTurnProgression.test.js:382`, 프런트엔드 전부(`applySessionSnapshot.js:186`·`applyTribunalResolved.js:50`이 `{ winner: ... }`만 뽑아 쓰고 미지의 키는 무시 — 검증 실패로 이어지지 않음).

## 2. 변경 내용

### 2.1 `backend/game-core/gameSession.js`

**(a) 새 private helper — `buildTerminalFields` 바로 위(현재 250행 주석 앞)에 추가**

```js
// ENDED 전용 전원 역할 공개 목록(순수 함수 — session.players를 읽기만 하고 매 호출마다 새
// 배열/새 원소를 만든다). 게임이 끝난 뒤에만 호출되므로 비밀 누설이 아니다: 이 시점 이후로는
// 어떤 mutation 진입점도 열려 있지 않다(assertSessionNotEnded). 순서는 session.players
// 삽입 순서 그대로이고, socket/Map/Set/repository 객체는 어떤 값에도 담지 않는다.
function buildEndedRoleReveals(session) {
    return [...session.players.values()].map(({ uuid, nickname, role, alive }) => ({
        uuid,
        nickname,
        role,
        team: ROLE_TEAMS[role],
        alive,
    }))
}
```

`alive` 키는 요구사항이 명시한 이름 그대로 쓴다(같은 payload 안의 `players[].isAlive`와 이름이 다르다 — 아래 리스크 참조).

**(b) `buildTerminalFields` (253–260행) 확장**

```js
if (session.winResult) {
    fields.winResult = { ...session.winResult }
    // reveals/mvp는 phase가 실제로 ENDED일 때만 만든다(방어) — winResult는 finalizeGameSession
    // 하나만 세팅하므로 정상 경로에서 둘은 항상 함께 성립하지만, 이 빌더는 호출자를 신뢰하지
    // 않는다는 이 파일의 원칙에 따라 phase를 독립적으로 재확인한다.
    if (session.phase === 'ENDED') {
        fields.winResult.reveals = buildEndedRoleReveals(session)
        fields.winResult.mvp = null // MVP 기획 미확정 — 슬롯만 예약한다
    }
}
```

250–252행 doc 주석도 함께 갱신: "role은 어디에도 포함하지 않는다" → "ENDED에서는 winResult.reveals가 전원의 role/team을 의도적으로 공개한다(그 외 위치에는 여전히 role/ballot/Map·Set/socket이 없다)".

**(c) `buildSessionSnapshot` (1762행) — 동일 처리**

```js
if (session.winResult) {
    fields.winResult = { ...session.winResult }
    if (session.phase === 'ENDED') {
        fields.winResult.reveals = buildEndedRoleReveals(session)
        fields.winResult.mvp = null
    }
}
```

1698–1707행 doc 주석(요구사항이 지목한 "1704줄 부근")에 ENDED 예외를 명시: "다른 참가자의 role/team/allies…는 어디에도 포함하지 않는다 — **단 phase가 ENDED일 때의 winResult.reveals만 예외다(게임 종료 후 전원 공개)**. self만 본인의 role 관련 필드를 담는다."

`{...session.winResult}`가 얕은 복사이므로 `reveals`/`mvp`는 **복사본에만** 붙는다 → canonical `session.winResult`는 계속 `{winner}` 단일 키(테스트 3117행 유지), 반환값을 변형해도 세션 오염 없음(매 호출 새 배열·새 원소).

`mvp`도 reveals와 같은 ENDED 게이트 안에 둔다 — 둘은 하나의 "종료 공개 블록"이고, 게이트를 나누면 "winResult는 있는데 ENDED가 아닌" 비정상 세션에서 서로 다른 부분 상태가 생긴다. (요구사항은 mvp 게이팅을 명시하지 않았으므로 이 판단을 여기에 기록해 둔다.)

### 2.2 `backend/game-core/__tests__/gameSession.test.js`

**(a) 비밀 검사기(3237–3287행)에 ENDED 예외 추가** — 시그니처는 바꾸지 않고 경로 기반으로 승인한다:

```js
// ENDED 종료 payload의 winResult.reveals는 "게임이 끝났으므로 전원 공개"가 명시적 계약인
// 유일한 서브트리다 — self와 같은 이유로 위치 자체를 예외로 둔다(키 이름 전역 예외가 아니다:
// winResult.reveals 아래가 아닌 곳의 role/team은 여전히 즉시 실패한다).
function isEndedRevealPath(path) {
    return path[0] === 'winResult' && path[1] === 'reveals'
}
```
- 키 검사: `assert.ok(nextInsideSelf || isEndedRevealPath([...path, key]) || !FORBIDDEN_PRIVATE_KEYS.has(key), ...)`
- 값 검사(3282행): `!insideSelf && !isEndedRevealPath(path) && !APPROVED_PUBLIC_VALUE_PATHS.has(...)`

**(b) 기존 단정 갱신**
- 3437행 / 3483행 / 3594행: `deepEqual(snapshot.winResult, {winner})` → `winner`/`mvp === null` 개별 단정 + `deepEqual(Object.keys(winResult).sort(), ['mvp','reveals','winner'])` + reveals를 `session.players`에서 계산한 기대값과 `deepEqual`.
- 3404–3440행 defensive-copy 테스트에 `first.snapshot.winResult.reveals[0].role = 'TAMPERED_ROLE'` / `reveals.push({...})` 변형을 추가하고, 재요청(`second`)이 오염되지 않았음 + `session.players.get(...).role` 불변 + `session.winResult`가 여전히 `{winner}`임을 확인.

**(c) 신규 테스트 (victory-resolution 섹션 3137행 뒤에 추가, `const { buildTerminalFields } = gameSession` 지역 구조분해)**
1. `buildTerminalFields: ENDED 세션 → winResult.reveals가 전원 {uuid,nickname,role,team,alive}를 session.players 삽입 순서 그대로 담고 mvp는 null이다` — `nightSessionOf3` + `commitNightResolution`으로 실제 ENDED 도달, reveals를 `[...session.players.values()]`로 만든 기대 배열과 `deepEqual`(순서 포함), `team === ROLE_TEAMS[role]`, 죽은 JOKER의 `alive === false`, top-level 키는 여전히 `['phase','players','winResult']`, `players[*]`는 여전히 `{uuid,isAlive}`.
2. `buildTerminalFields: ENDED가 아닌 세션에는 reveals/mvp가 없다(방어)` — `nightSessionOf4NoWin`으로 NIGHT 세션을 만든 뒤 테스트 안에서만 `session.winResult = { winner: 'CITIZEN' }`를 손으로 세팅(판정 로직 호출 없음) → `Object.hasOwn(fields.winResult,'reveals') === false`, `mvp`도 없음. winResult 자체가 없는 세션은 `winResult` 키 자체가 없음도 함께 확인.
3. `buildTerminalFields: 반환값을 변형해도 canonical session은 오염되지 않는다` — reveals 원소의 role 변조·배열 push 후 `session.players`·`session.winResult`(`{winner}` 단일 키, 참조 동일) 불변, 재호출 결과가 fresh.
4. 스냅샷 경로 신규 테스트: ENDED 세션 `buildSessionSnapshot`의 `winResult.reveals`가 전원 정확 + `assertNoForbiddenPrivateData` 통과, 진행 중(DAY/NIGHT) 세션 스냅샷에는 `winResult` 키 자체가 없음.

### 2.3 `backend/socket/__tests__/gameSession.test.js`

**(a)** 3268–3305행 검사기에 2.2(a)와 동일한 `isEndedRevealPath` 예외를 넣는다(두 파일이 의도적으로 같은 검사기를 복제해 둔 구조이므로 동일하게 유지).

**(b)** 2476 / 2520 / 3121 / 3173행: `deepEqual(expectedPayload.winResult, {winner})` → winner + `mvp === null` + reveals 기대값(세션에서 계산) `deepEqual`. `expectedPayload`는 이미 `buildTerminalFields(session)`를 spread하므로, 각 참가자에게 배달된 payload와의 `deepEqual`(2486/2526/3126/3178행)이 **밤·재판 두 broadcast 경로 모두에서 reveals가 전달됨**을 그대로 검증한다. 여기에 "배달된 payload의 `winResult.reveals`가 전원 role/team을 담는다"는 직접 단정을 한 줄 추가한다.

**(c)** 2489 / 2529 / 3129 / 3181행 substring 검사: `'"role"'`/`'"team"'`을 목록에서 빼는 대신 **reveals 서브트리를 제거한 나머지**에 대해 기존 검사를 그대로 돌린다(회귀 의도 보존):
```js
const { winResult: { reveals, mvp, ...winnerOnly }, ...rest } = delivered[0].payload
const serialized = JSON.stringify({ ...rest, winResult: winnerOnly })
for (const forbidden of ['"role"', '"team"', '"allies"', 'privateResults', 'ballotSnapshot', 'nightActions']) {
    assert.equal(serialized.includes(forbidden), false)
}
assert.equal(Array.isArray(reveals), true)
assert.equal(mvp, null)
```
즉 role/team은 **오직 `winResult.reveals` 안에서만** 나타난다는 더 강한 단정이 된다.

**(d)** 3540 / 3625행 ENDED 스냅샷 ack: 2.2(b)와 동일하게 갱신 + `assertNoForbiddenPrivateData` 재통과 확인.

**(e)** 2550–2552 / 3212–3214행 불변성 테스트에 `rebuilt.winResult.reveals.length === session.players.size` 한 줄 추가(캡처본 변조 후에도 재구성이 fresh함).

## 3. 검증

`backend`에서 **npm install/ci 금지**, 기존 `node_modules`만 사용:

1. `cd backend; npm test` — `node --env-file=.env.test --test`(`.env.test` 존재 확인함). backend 전체 테스트 PASS가 완료 기준.
2. 좁혀 볼 때: `node --env-file=.env.test --test game-core/__tests__/gameSession.test.js`, `node --env-file=.env.test --test socket/__tests__/gameSession.test.js`, `node --env-file=.env.test --test socket/__tests__/nightTurnProgression.test.js`.
3. frontend는 실행/수정 대상이 아니다. 다만 `applySessionSnapshot.js:186`·`applyTribunalResolved.js:50`이 `winner`만 골라 담고 미지 키를 무시한다는 사실을 근거로 "프런트 무수정으로도 깨지지 않음"을 결론에 명시한다(코드 읽기로 확인 완료, 변경 없음).
4. 완료 보고에는 실제 테스트 출력(pass/fail 수)을 근거로 붙인다. 실패가 남으면 숨기지 않고 그대로 보고한다.

## 4. 리스크 / 판단 근거

- **키 이름 불일치(`reveals[].alive` vs `players[].isAlive`)**: 같은 payload 안에 두 이름이 공존한다. 요구사항이 `alive`를 명시했고 기존 `players` 키는 유지가 상위 규칙이라 그대로 간다. 프런트 연동 시 혼동 가능 — 결과 보고에 명시.
- **비밀 검사기 완화가 진짜 leak을 덮을 위험**: 그래서 키 이름 전역 예외(`FORBIDDEN_PRIVATE_KEYS`에서 role/team 제거)가 아니라 **`winResult.reveals` 경로 예외**로 좁히고, socket 쪽 substring 검사는 reveals를 도려낸 나머지에 그대로 적용한다. 다른 위치의 role/team leak은 여전히 즉시 실패한다.
- **ENDED 아닌데 winResult가 있는 세션**: 정상 경로에서 생기지 않는다(`finalizeGameSession`이 둘을 함께 세팅하는 유일한 writer). 방어 게이트는 phase 재확인으로 구현하고, 그 상태는 테스트에서 손으로만 만든다 — 판정 로직(`evaluateWinCondition`/`finalizeGameSession`)은 읽기만 한다.
- **소켓 계층 무수정 가정**: 두 broadcast 지점이 빌더 결과를 그대로 spread한다는 것을 코드로 확인했다(804–811, 1220–1225행). ACK 본문에는 terminal 필드가 애초에 들어가지 않으므로(테스트 3097–3107행이 고정) ACK 계약도 그대로다.
- **payload 크기**: 10인 기준 reveals 10개 원소 추가 — 무시 가능.
- **`mvp` 게이팅 판단**: 요구사항이 mvp의 phase 조건을 말하지 않아 reveals와 같은 ENDED 게이트에 넣는 쪽으로 결정했다(근거는 2.1(c)). 반대 해석(항상 mvp:null)이 필요하면 게이트 밖으로 한 줄 옮기면 된다.

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | buildEndedRoleReveals 추가, buildTerminalFields·buildSessionSnapshot에 ENDED 한정 reveals/mvp 부착, 두 doc 주석에 ENDED 예외 명시 |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | 비밀 검사기 winResult.reveals 경로 예외, ENDED 스냅샷 단정 갱신, buildTerminalFields 단위·방어·불변성 테스트 신설 |
| MODIFY | backend/socket/__tests__/gameSession.test.js |  | 검사기 동일 예외, 밤·재판 terminal broadcast와 ENDED 스냅샷 ack의 winResult 단정 갱신, role/team은 reveals 안에서만 나타남을 검증 |
| REFERENCE | backend/socket/gameSession.js |  | buildTerminalFields 소비 지점(밤 804행·재판 1220행) — 무수정 확인 근거 |
| REFERENCE | backend/socket/__tests__/nightTurnProgression.test.js |  | ENDED 전이 테스트가 영향받지 않음을 확인 |
| REFERENCE | frontend/src/domains/game/ingame/store/applySessionSnapshot.js |  | winResult에서 winner만 취하고 미지 키를 무시함 — 프런트 무수정 안전성 근거 |
