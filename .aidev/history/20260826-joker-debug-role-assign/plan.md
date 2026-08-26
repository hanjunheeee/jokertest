# 테스트 전용 역할 고정 배정 (backend) — 구현 계획

## 1. 현재 코드 사실 확인 (읽은 것)

- `backend/game-core/gameSession.js:321` `fisherYatesShuffle(items, randomFn)` — 순수 함수. **수정 금지 대상**.
- `backend/game-core/gameSession.js:339` `assignRoles(players, jokerCountOrComposition, randomFn = Math.random)`
  - 본문: `fisherYatesShuffle` → 2번째 인자가 `number`면 `computeRoleComposition(players.length, n)`, 아니면 그 객체 자체를 구성으로 사용 → `JOKER/DOCTOR/GUARD/WITCH_HUNTER/CITIZEN` 순으로 `roles` 배열을 만들고 → `shuffled.map((p, i) => ({ ...p, role: roles[i], alive: true }))`.
  - 즉 반환 원소 형태는 `{ ...player, role, alive: true }`이고 원본 배열/원소는 변형하지 않는다(테스트 `gameSession.test.js:98`이 이를 고정하고 있음).
- `backend/game-core/gameSession.js:392` `buildSessionCandidate(room, { randomFn, gameIdFn })`
  - `const players = [...room.players.values()]` — **room.players Map의 삽입 순서 = 참가자 입장 순서**가 그대로 `assignRoles`의 첫 인자가 된다. 요구사항 2의 "입장 순서"는 이 배열 순서다.
  - `resolveRoleComposition(room.settings, players.length)` 성공 시 `assignRoles(players, resolved.composition, randomFn)` 호출(`:407`). 즉 정상 게임 시작 경로에서 `assignRoles`의 2번째 인자는 **항상 해석된 구성 객체**다.
  - 세션에 `jokerCount: resolved.composition.JOKER`, `roleComposition: { ...resolved.composition }`을 함께 보관한다.
- `backend/game-core/gameSession.js:484` `assertValidSessionForCommit(session)` — 요구사항 3이 말하는 "구성 검사". **수정 금지 대상**.
  - `:555~573` 각 player의 `role`이 `GAME_ROLES` 값 중 하나여야 하고 `alive === true`여야 하며, 역할별 실제 개수를 센다.
  - `:581~602` `expected`는 `session.roleComposition`(있으면, `validateResolvedComposition`으로 재검증 후) 또는 `computeRoleComposition(players.size, jokerCount)`이고, 5역할 중 하나라도 개수가 어긋나면 `throw` → **게임 시작 실패**.
  - 결론: 고정 배정이 안전하려면 *배정된 역할별 개수가 `assignRoles`에 들어온 구성과 정확히 일치*해야 한다. 이것이 "구성 검증과 충돌" 여부를 판정하는 유일한 기준이며, `assignRoles` 안에서 자기 인자만으로 판정 가능하다.
- `backend/game-core/roleComposition.js` — `computeRoleComposition`, `validateResolvedComposition` 등. **읽기만 한다.**
- env 플래그 선례: `backend/socket/matchmaking.js:50~58` (`process.env.NODE_ENV`, `process.env.GAME_DEV_MIN_PLAYERS ?? 1`) — 매 호출마다 `process.env`를 읽고 모듈 로드 시점에 캐싱하지 않는다. 테스트도 이 전제를 쓴다(`backend/socket/__tests__/matchmaking.test.js:1100~1118`: 저장 → 설정 → 복원).
- 테스트 실행: `backend/package.json:15` `"test": "node --env-file=.env.test --test"`, `:10` `"test:game-core": "node --test game-core/__tests__/*.test.js"`. 루트 `package.json:9`은 `test:game-core`를 backend로 위임한다.
- `.env.example`은 **저장소에 존재하지 않는다**(`**/*.env*` glob 결과는 `backend/.env.test` 하나뿐). `.gitignore:1~9`는 이미 `!.env.example` / `!**/.env.example` 예외를 갖고 있으므로 새 파일이 자동으로 무시되지 않는다 — .gitignore는 손대지 않는다.
- 서버 런타임의 env 로딩은 `backend/index.js:3` `require("dotenv").config()` — cwd가 backend일 때 `backend/.env`를 읽는다. 따라서 예시 파일의 canonical 위치는 **`backend/.env.example`**이다(이번 작업 범위도 backend 한정).

## 2. 설계 결정

**분기 지점은 `assignRoles` 최상단 한 곳.** 기존 랜덤 경로 라인(`fisherYatesShuffle` 호출 이하 전부)은 한 글자도 바꾸지 않고, 그 앞에 early-return 한 줄만 얹는다:

```js
function assignRoles(players, jokerCountOrComposition, randomFn = Math.random) {
    const fixed = resolveDebugFixedRoleAssignment(players, jokerCountOrComposition)
    if (fixed) return fixed
    const shuffled = fisherYatesShuffle(players, randomFn)   // ↓ 이하 기존 코드 그대로
    ...
}
```

플래그 미설정이면 `resolveDebugFixedRoleAssignment`가 `process.env.DEBUG_FIXED_ROLES` 하나를 읽고 즉시 `null`을 반환하므로, production 경로는 "분기 한 번"만 추가된다(요구사항 1).

`buildSessionCandidate`가 아니라 `assignRoles`에 두는 이유: 구성 객체(`resolved.composition`)와 입장 순서 `players` 배열이 동시에 손에 들어오는 유일한 지점이고, 세션 조립·commit 경로를 전혀 건드리지 않아도 되기 때문이다.

**구성 재계산 규칙 중복에 대해:** 헬퍼도 `typeof jokerCountOrComposition === 'number'` 판정을 스스로 한다. 기존 랜덤 경로의 두 줄을 위로 끌어올려 공유하면 "랜덤 경로 수정 금지"를 어기게 되므로, 3줄짜리 동일 판정을 헬퍼 안에서 다시 하고 그 이유를 주석으로 남긴다.

**env를 모듈 로드 시점에 캐싱하지 않는다** — `matchmaking.js`의 선례와 동일하게 호출마다 읽는다. 그래야 테스트가 `process.env`를 켜고 끄며 두 경로를 모두 검증할 수 있다.

## 3. 파일별 변경 내용

### 3.1 `backend/game-core/gameSession.js` (MODIFY)

**(a) 새 상수 1개 + 새 함수 2개를 `fisherYatesShuffle`/`assignRoles` 바로 위에 추가**한다.

```js
// 테스트 전용 결정적 역할 배정 플래그. 값이 없으면(=production 기본) 아래 모든 로직은
// process.env 조회 한 번으로 끝나고 기존 랜덤 경로가 그대로 실행된다.
const DEBUG_FIXED_ROLES_ENV = 'DEBUG_FIXED_ROLES'
```

`parseDebugFixedRoleList(rawValue)` — 순수 함수.
- `typeof rawValue !== 'string'`이거나 `trim()`이 빈 문자열이면 `null`(= 플래그 꺼짐, 경고 없음). 셸/`--env-file`에서 빈 값은 "설정하지 않음"과 구분할 실익이 없으므로 조용히 꺼진 것으로 본다.
- `,`로 split → 각 토큰 `trim()` 후 `toUpperCase()`.
- 토큰 하나라도 `Object.prototype.hasOwnProperty.call(GAME_ROLES, token)`이 아니면 `{ ok:false, reason:\`UNKNOWN_ROLE:${token}\` }`. (`hasOwnProperty`로 검사해 `constructor`/`toString` 같은 프로토타입 키가 역할로 통과하는 구멍을 막는다.)
- 성공 시 `{ ok:true, roles:[...] }`.

`resolveDebugFixedRoleAssignment(players, jokerCountOrComposition)` — `process.env`만 읽고 아무 상태도 바꾸지 않는다. 반환은 배정 배열 또는 `null`.
1. `const raw = process.env[DEBUG_FIXED_ROLES_ENV]`; 위 파서가 `null`이면 그대로 `null` 반환(정상 랜덤 경로, 경고 없음).
2. 파싱 실패 → `warnAndFallback(reason)`.
3. `roles.length !== players.length` → `LENGTH_MISMATCH:${roles.length}!=${players.length}`로 fallback (요구사항 3의 길이 불일치).
4. 구성 대조: `const composition = typeof jokerCountOrComposition === 'number' ? computeRoleComposition(players.length, jokerCountOrComposition) : jokerCountOrComposition`. `composition`이 plain object가 아니면 fallback. 그 다음 `Object.keys(GAME_ROLES)` 각각에 대해 고정 목록의 실제 개수를 세어 `composition[role]`과 비교하고, 하나라도 다르면 `COMPOSITION_MISMATCH:<어긋난 역할 목록>`으로 fallback. — 이 대조가 `assertValidSessionForCommit`의 `mismatchedRoles` 검사(`:596`)와 동일한 기준이므로, 통과한 고정 배정은 commit에서 절대 throw를 유발하지 않는다.
5. 전부 통과 → `players.map((player, index) => ({ ...player, role: roles[index], alive: true }))`. **셔플하지 않고 입장 순서 그대로**, 반환 원소 형태는 랜덤 경로와 완전히 동일하며 원본 배열/원소를 변형하지 않는다.

fallback은 `console.warn` **정확히 한 줄**:
```js
console.warn(`[DEBUG_FIXED_ROLES] 고정 역할 배정을 건너뛰고 랜덤 배정으로 되돌립니다 — ${reason}`)
```
그리고 `null`을 반환한다(예외를 던지지 않는다 → 게임 시작은 정상 진행).

**(b) `assignRoles`(`:339`)에 위의 early-return 2줄만 추가.** 그 아래 5줄(`fisherYatesShuffle` ~ `return shuffled.map(...)`)은 변경하지 않는다. 함수 상단 JSDoc에 "플래그가 켜진 경우에만 결정적 고정 배정이 앞선다"는 한 문단을 덧붙인다.

**(c) `module.exports.__testables`(`:2263`)에 `parseDebugFixedRoleList`, `resolveDebugFixedRoleAssignment`를 추가한다.** 기존 키는 그대로 둔다(테스트 `gameSession.test.js:254`가 `__testables.assignRoles` 존재를 검사하므로 삭제·개명 금지).

`fisherYatesShuffle`, `computeRoleComposition`, `resolveRoleComposition`, `validateResolvedComposition`, `assertValidSessionForCommit`, `buildSessionCandidate`, `commitGameSession`은 **한 줄도 수정하지 않는다.**

### 3.2 `backend/game-core/__tests__/gameSession.test.js` (MODIFY)

`assignRoles` 섹션(`:81~137`) 끝에 새 블록을 추가한다. 기존 테스트는 수정하지 않는다(요구사항 "플래그 미설정 → 기존 랜덤 경로"의 증거가 바로 이 무변경 통과다).

공용 헬퍼 두 개를 파일 안에 추가:
- `withFixedRoles(value, fn)` — `process.env.DEBUG_FIXED_ROLES` 원값을 저장 → 설정(`value === null`이면 `delete`) → `fn()` → `finally`에서 원상복구(`undefined`였으면 `delete`).
- `captureWarnings(fn)` — `console.warn`을 배열 수집 함수로 교체하고 `finally`에서 원복, 수집된 메시지 배열 반환.

추가 테스트:
1. **입장 순서대로 정확히 배정** — 5명(`p0..p4`), `DEBUG_FIXED_ROLES='JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN'`, 구성 객체 `{JOKER:1,DOCTOR:1,GUARD:1,WITCH_HUNTER:1,CITIZEN:1}`로 `assignRoles(players, composition, () => 0.5)` 호출 → `assigned.map(p => [p.uuid, p.role])`이 입력 순서와 정확히 일치하고 전원 `alive === true`. 경고 없음.
2. **randomFn과 무관** — 같은 입력에 서로 다른 randomFn(`() => 0`, `() => 0.999`)을 줘도 결과가 동일(셔플하지 않음을 고정).
3. **원본 불변** — 고정 경로에서도 `players` 배열/원소가 변형되지 않는다(기존 랜덤 테스트와 동일한 계약).
4. **길이 불일치 → 랜덤 fallback + 경고 1줄** — 4명 + 3개 목록. 결과 역할 개수는 구성과 일치하고, `console.warn`이 정확히 1회, 메시지에 `DEBUG_FIXED_ROLES` 포함.
5. **알 수 없는 역할명 → fallback + 경고 1줄** — `'JOKER,MAYOR,CITIZEN'`.
6. **구성 충돌 → fallback + 경고 1줄** — 4명, 구성 `computeRoleComposition(4, 1)`(JOKER 1/CITIZEN 3)인데 목록은 `'JOKER,JOKER,CITIZEN,CITIZEN'`.
7. **빈 문자열/공백은 "미설정"과 동일** — `DEBUG_FIXED_ROLES=''`일 때 경고 없이 랜덤 경로.
8. **게임 시작이 실패하지 않는다(통합)** — `makeRoom`으로 3명 방을 만들고 잘못된 목록(길이 불일치)을 설정한 상태에서 `prepareGameSession(room, { randomFn: () => 0 })` → `ok:true`, 이어서 `commitGameSession(candidate.session)`이 throw 없이 성공.
9. **유효한 고정 목록으로도 commit이 통과한다(통합)** — 같은 3명 방(`jokerCount:1` → 구성 JOKER 1/CITIZEN 2)에 `'CITIZEN,JOKER,CITIZEN'`을 설정 → `prepareGameSession` 후 `session.players.get('u2').role === 'JOKER'`(입장 순서 2번째), `commitGameSession` 성공.
10. **export 호환성** — `__testables.resolveDebugFixedRoleAssignment`/`parseDebugFixedRoleList`가 함수로 노출된다.

모든 env 조작은 `withFixedRoles`의 `finally` 복원을 거치므로 같은 프로세스에서 도는 다른 테스트 파일로 상태가 새지 않는다.

### 3.3 `backend/.env.example` (CREATE)

저장소에 예시 파일이 아직 없다. 새로 만들되, backend 코드가 실제로 읽는 변수만 주석과 함께 담는다(값은 전부 placeholder, 비밀 없음):

- `PORT`(`index.js:46`), `NODE_ENV`(`models/index.js:14` 등), `FRONTEND_URL`(`index.js:26`, `socket/socket.js:28`), `JWT_SECRET`(`utils/jwt.js:11`), `DATABASE_URL`(`models/index.js:26`), `GAME_DEV_MIN_PLAYERS`(`socket/matchmaking.js:56`).
- 그리고 이번 항목 — **기본 미설정(주석 처리)**:

```dotenv
# 테스트 전용 역할 고정 배정. 설정하면 게임 시작 시 참가자 "입장 순서"대로 아래 목록의
# 역할을 그대로 배정하고 셔플하지 않는다(E2E 시나리오 재현용). 미설정이면 기존 랜덤 배정.
# 목록 길이가 참가자 수와 다르거나, 알 수 없는 역할명이 있거나, 방의 역할 구성과 개수가
# 어긋나면 경고 한 줄을 남기고 랜덤 배정으로 되돌아간다(게임은 정상 시작된다).
# 사용 가능한 역할: JOKER, CITIZEN, DOCTOR, GUARD, WITCH_HUNTER
# 운영 환경에서는 절대 설정하지 말 것.
# DEBUG_FIXED_ROLES=JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN
```

`.gitignore`는 이미 `!.env.example`/`!**/.env.example` 예외를 갖고 있으므로 수정하지 않는다. `backend/.env.test`도 수정하지 않는다 — 테스트는 플래그를 코드에서 켜고 끄며, 파일에 값을 넣으면 기존 랜덤 경로 테스트가 오염된다.

**frontend은 한 파일도 건드리지 않는다.**

## 4. 검증

1. `cd backend && npm test` — backend 전체(`game-core` + `socket` + `utils`) PASS. `--env-file=.env.test`에 `DEBUG_FIXED_ROLES`가 없으므로 기존 테스트 전부가 랜덤 경로 그대로 통과해야 한다(요구사항 "플래그 미설정 → 기존 랜덤 경로"의 증거).
2. `cd backend && npm run test:game-core` — game-core 단독 실행에서도 신규 테스트 PASS.
3. 새 테스트가 다음을 각각 고정한다: 입장 순서 정확 일치 / randomFn 무관 / 길이 불일치·미지 역할명·구성 충돌 시 fallback + `console.warn` 1회 / fallback 상태에서도 `prepareGameSession`+`commitGameSession` 성공 / 유효 목록에서 commit 통과.
4. 수동 확인(선택): `DEBUG_FIXED_ROLES` 미설정으로 서버를 띄우면 로그에 어떤 경고도 나오지 않는다.

## 5. 위험 요소와 대응

| 위험 | 대응 |
| --- | --- |
| 고정 배정이 `assertValidSessionForCommit`의 개수 검사와 어긋나 게임 시작이 throw로 죽는다 | 헬퍼가 배정 **전에** 동일한 기준(역할별 개수 = 구성)으로 대조하고, 어긋나면 배정 자체를 포기한다. 통합 테스트로 commit 성공까지 확인한다. |
| env가 켜진 채 기존 테스트가 돌아 결과가 흔들린다 | `.env.test`에 값을 넣지 않고, 테스트는 `withFixedRoles`의 `finally`에서 반드시 원복한다(`matchmaking.test.js:1100`과 동일 패턴). |
| 모듈 로드 시점 캐싱으로 테스트가 플래그를 못 켠다 | 호출마다 `process.env`를 읽는다(캐싱 금지). |
| `GAME_ROLES['constructor']` 같은 프로토타입 키가 역할로 통과 | `Object.prototype.hasOwnProperty.call(GAME_ROLES, token)`으로만 판정. |
| 구성 객체가 아닌 값(예: 잘못 조립된 호출)이 들어와 헬퍼가 던진다 | 구성이 plain object가 아니거나 값이 정수가 아니면 fallback 처리(예외 없음). |
| `console.warn`이 매 게임마다 여러 줄 쏟아진다 | fallback 경로당 정확히 한 번만 호출하고, 테스트가 호출 횟수 1을 검사한다. |
| `.env.example` 위치가 관습과 다르다 | 서버는 cwd=backend에서 `dotenv.config()`로 `backend/.env`를 읽으므로(`backend/index.js:3`) 예시도 `backend/.env.example`에 둔다. |

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js |  | assignRoles 최상단 고정 배정 분기 + 파싱·구성 대조 헬퍼 추가, __testables 노출 |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | 고정 배정·fallback·commit 통합 테스트 추가 |
| CREATE | backend/.env.example |  | DEBUG_FIXED_ROLES 주석 항목(기본 미설정)과 기존 backend 환경 변수 예시 |
| REFERENCE | backend/game-core/roleComposition.js |  | computeRoleComposition·구성 검증 계약 확인 |
| REFERENCE | backend/socket/matchmaking.js |  | env 플래그 읽기 스타일 선례 |
| REFERENCE | backend/socket/__tests__/matchmaking.test.js |  | 테스트에서 process.env 저장·복원 패턴 |
| REFERENCE | backend/package.json |  | 테스트 실행 명령(--env-file=.env.test) 확인 |
| REFERENCE | backend/.env.test |  | 테스트 env 로딩 내용(플래그 미포함 유지) |
| REFERENCE | .gitignore |  | .env.example 예외가 이미 있어 수정 불필요함을 확인 |
