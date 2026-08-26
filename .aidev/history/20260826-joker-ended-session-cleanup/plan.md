# ENDED 세션 재접속 시 자동 정리 (backend) — 구현 계획

## 1. 현재 코드 확인 결과

**`backend/game-core/gameSession.js:305-311` — `getActiveSessionRoutingInfo(uuid)`**
```js
const gameId = playerSession.get(uuid)
if (!gameId) return null
const session = gameSessions.get(gameId)
if (!session) return null
return { gameId: session.id, channelId: session.channelId }
```
- `playerSession`에 uuid가 있어도 `gameSessions`에 세션이 없으면 `null`을 돌려주는 기존 방어가 있다 → **routing이 non-null이면 세션 객체는 반드시 실재한다**. 이 사실이 아래 2번의 `endGameSessionForPlayer` 안전성을 보장한다(그 함수는 `gameSessions.get(gameId)`가 undefined면 `session.phase` 접근에서 throw한다).
- 이 함수를 참조하는 곳은 `backend/socket/gameSession.js:101` 하나뿐이고, 테스트는 현재 **하나도 없다**(repo 전체 grep 결과: 소스 3곳 + requirement.md).

**`backend/socket/gameSession.js:100-108` — `resyncSessionRouting(socket, uuid)`**
```js
async function resyncSessionRouting(socket, uuid) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return
    socket.data.activeGameId = routing.gameId
    if (!socket.rooms.has(routing.channelId)) socket.join(routing.channelId)
}
```
- 유일한 호출부는 `backend/socket/socket.js:73`, `registerConnectionHandlers` 안의 fire-and-forget(`.catch`로 로깅)이다. **`io`를 받지 않는다** — 그런데 요구사항 2가 요구하는 `finalizeGameSessionEnd(io, session, reason)`는 `io`가 필수다(`matchmaking.cleanupRoomStateForSessionParticipants(io, ...)`, `io.to().emit`, `io.in().socketsLeave`). 따라서 **시그니처를 `(io, socket, uuid)`로 바꾸고 호출부 1곳을 함께 고친다.** 이는 수정 금지 목록에도, "계약 유지" 목록(onDisconnect / handleLeaveGameSession / endGameSessionForPlayer)에도 없다. `socket.nsp.server`로 io를 몰래 얻는 우회는 fake socket 기반 기존 테스트 하네스와 맞지 않아 채택하지 않는다.
- 이 함수를 참조하는 테스트도 현재 **하나도 없다**.

**`backend/game-core/gameSession.js:2151-2180` — `endGameSessionForPlayer(uuid, reason, expectedGameId)`**
- ENDED 세션이면: `detachedUuids`에 uuid를 넣고 `playerSession.delete(uuid)`, 마지막 참가자일 때만 `gameSessions`/`roomGameSession`까지 삭제하고 `sessionDeleted:true`를 반환한다. 요구사항이 원하는 정리가 이미 정확히 구현돼 있다 — **core는 손대지 않는다.**

**`backend/socket/gameSession.js:1272-1294` — `finalizeGameSessionEnd(io, session, reason)`** / **`:1346-1348` — `handleLeaveGameSession`의 `sessionDeleted` 분기**: 그대로 재사용한다(선언 hoisting 덕에 파일 앞쪽의 `resyncSessionRouting`에서 호출 가능 — 같은 파일의 `handleSubmitNightAction`이 뒤에 선언된 `handleResolveNight`를 참조하는 기존 패턴과 동일).

**`backend/socket/socket.js:96-114` — `handleConnection`**: `onlineUsers.set(uuid, socket.id)`를 첫 await 이전에 동기적으로 수행하고, `registerConnectionHandlers`는 그 뒤에 `resyncSessionRouting`을 부른다. 즉 resync 시점에 registry는 이미 새 소켓을 가리킨다(요구사항 배경의 그 상태). 이 순서는 건드리지 않는다.

---

## 2. 파일별 변경 내용

### (A) `backend/game-core/gameSession.js` — `getActiveSessionRoutingInfo`

반환값에 `phase`를 추가한다.

```js
return { gameId: session.id, channelId: session.channelId, phase: session.phase }
```

JSDoc(300-304행 주석)도 함께 갱신한다: 반환하는 것은 **라우팅 정보 + 현재 phase**이고, phase는 소켓 계층이 "재부착할지, ENDED 잔존을 정리할지"를 고르는 데만 쓰는 값이며 role/team/ballot 등 비밀은 여전히 아무것도 싣지 않는다는 점을 명시한다. 함수는 계속 순수 조회이고 registry를 쓰지 않는다.

### (B) `backend/socket/gameSession.js` — `resyncSessionRouting`

시그니처를 `(io, socket, uuid)`로 바꾸고 ENDED 분기를 추가한다.

```js
async function resyncSessionRouting(io, socket, uuid) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return

    if (routing.phase === 'ENDED') {
        let result
        try {
            result = gameSessionCore.endGameSessionForPlayer(uuid, 'RECONNECT_AFTER_END', routing.gameId)
        } catch (err) {
            console.error('[ENDED 세션 재접속 정리 에러]', err)
            return
        }
        if (!result.ok) return
        if (!result.sessionDeleted) return
        finalizeGameSessionEnd(io, result.session, result.reason)
        return
    }

    socket.data.activeGameId = routing.gameId
    if (!socket.rooms.has(routing.channelId)) {
        socket.join(routing.channelId)
    }
}
```

설계 포인트(주석으로 남길 내용):
- **ENDED 분기에서는 `socket.data.activeGameId`를 바인딩하지 않는다.** 그 값의 유일한 소비자는 `onDisconnect`이고, 이미 정리된(또는 곧 정리될) gameId를 심어봐야 나중 disconnect가 `NOT_IN_SESSION`/`STALE_SESSION_MISMATCH`로 no-op될 뿐이다. 새 게임을 시작하면 `matchmaking.handleStartGame`이 다시 심는다. 정리 경로에서 라우팅 상태를 남기지 않는 편이 "재부착하지 않는다"는 요구사항과도 일치한다.
- **`getActiveSessionRoutingInfo` 호출과 `endGameSessionForPlayer` 호출 사이에 await이 없다** — `finalizeGameSessionEnd`의 계약("종료 core 호출과 동일한 동기 구간에서 matchmaking 정리")을 그대로 만족한다. `expectedGameId`로 `routing.gameId`를 넘겨 ABA 가드도 유지한다(그 사이 상태가 바뀔 수 없으므로 실패할 수 없지만, 이 파일의 관례대로 명시한다).
- **`sessionDeleted`가 false면(아직 남은 참가자가 있으면) 아무 방송도 하지 않는다** — `handleLeaveGameSession`/`onDisconnect`와 정확히 같은 규칙이라 "game_ended는 한 번뿐"이라는 계약이 유지된다.
- try/catch는 `onDisconnect`(1462-1468행)의 형태를 그대로 따른다. 앞서 확인했듯 routing이 non-null이면 세션은 실재하므로 실제로는 도달 불가능한 방어다.
- 비-ENDED 경로는 한 글자도 바뀌지 않는다(멱등 join 포함).

`module.exports`의 `resyncSessionRouting` 항목은 그대로 두고, 함수 상단 JSDoc(93-99행)에 ENDED 분기 계약을 추가한다.

### (C) `backend/socket/socket.js` — `registerConnectionHandlers`

호출부 한 줄과 그 위 주석을 갱신한다.

```js
// 재접속 시 기존 활성 세션의 channel·activeGameId를 재바인딩한다. 대상 세션이 이미 ENDED면
// 재부착 대신 그 참가자를 세션에서 정리한다(그래서 io가 필요하다 — 마지막 참가자였다면
// game_ended 방송·channel 정리까지 이어진다).
gameSession.resyncSessionRouting(io, socket, uuid).catch((err) => {
    console.error("\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m", err);
});
```

`onDisconnect`/`registerDisconnectHandler` 등 다른 배선은 건드리지 않는다.

---

## 3. 테스트

기존 테스트 하네스를 그대로 쓴다: `node:test` + `backend/socket/__tests__/testHelpers/matchmakingFixtures.js`의 `createFakeSocket`/`createFakeIo`. ENDED 상태는 `session.phase = 'ENDED'` 직접 대입으로 만든다 — `backend/game-core/__tests__/gameSession.test.js:4562`가 이미 쓰는 확립된 관례이고, phase 전이 로직을 건드리지 않는다는 제약과도 맞는다(`finalizeGameSession`은 export되지 않는다).

### (D) `backend/game-core/__tests__/gameSession.test.js` — `getActiveSessionRoutingInfo` 계약

상단 destructure에 `getActiveSessionRoutingInfo`를 추가하고(현재 이 파일에 없음) 테스트를 추가한다:

1. 진행 중 세션의 참가자 → 반환 객체의 키 집합이 정확히 `['channelId', 'gameId', 'phase']`이고 `phase`가 커밋 직후 phase(`ROLE_REVEAL`)와 일치한다.
2. `session.phase = 'ENDED'`로 바꾸면 같은 호출이 `phase: 'ENDED'`를 돌려준다(gameId/channelId는 불변).
3. 활성 세션 없는 uuid → `null`(기존 회귀).
4. `__deleteGameSessionOnlyForTests(session.id)`로 registry 불일치를 만들면 여전히 `null`(기존 회귀 — 새 phase 접근이 throw로 바뀌지 않았음을 못박는다).

### (E) `backend/socket/__tests__/gameSession.test.js` — `resyncSessionRouting` 시나리오

`commitTwoPlayerSession()`(87-105행, 살아있는 session 객체를 그대로 돌려준다)을 재사용하고, 재접속 소켓은 `createFakeSocket(uuid, { id: 'sock-<uuid>-new' })`로 만들어 "새 소켓"을 표현한다. 추가할 테스트:

1. **ENDED + 잔존 → 정리(요구사항의 핵심 시나리오).** 세션을 커밋하고 `session.phase = 'ENDED'`. 새 소켓으로 `await resyncSessionRouting(io, newSocket, 'p1')`. 검증: `newSocket.joined`가 비어 있고 `newSocket.rooms.size === 0`, `newSocket.data.activeGameId === undefined`, core 스냅샷의 `playerSession`에 `p1`이 없다. p2가 남아 있으므로 `gameSessions`에는 세션이 그대로 있고 `game_ended` 방송은 0건이다.
2. **마지막 참가자 정리 → finalize.** 위 상태에서 p2로도 resync를 호출. 검증: `gameSessions`/`roomGameSession`에서 세션 제거, `game_ended` 방송이 정확히 1건이고 payload가 `{ gameId, reason: 'RECONNECT_AFTER_END' }`, 채널에 남아 있던 소켓들이 `socketsLeave`로 빠진다.
3. **정리 이후 같은 uuid로 새 세션 커밋 성공.** 2번에 이어 새 roomId로 `prepareGameSession` → `ok:true`(`PLAYER_ALREADY_IN_SESSION`이 아님), `commitGameSession`이 throw하지 않는다("참가자가 이미 다른 GameSession에 속함" 회귀 방지 — 이 요구사항의 최종 목적).
4. **진행 중 세션 재접속은 기존대로 재부착.** phase를 건드리지 않은 세션에 새 소켓으로 resync → `socket.data.activeGameId === session.id`, `socket.rooms.has(channelId)`, core 스냅샷의 `playerSession`/`gameSessions`/`roomGameSession`이 전부 무변경, 방송 0건.
5. **멱등 재부착 회귀.** 이미 channel에 들어있는 소켓으로 두 번 호출해도 `socket.joined.length === 0`(추가 join 없음).
6. **활성 세션 없는 uuid → no-op.** join·방송 없음, `activeGameId` undefined.
7. **(방어) core가 throw해도 resync는 reject하지 않는다.** `gameSessionCore.endGameSessionForPlayer`를 임시로 throw하도록 교체하고(try/finally로 원복) `assert.doesNotReject`. 소켓 계층이 모듈 객체를 통해 호출하므로 교체가 가능하다.

### 실행 명령

```
cd backend && npm test          # node --env-file=.env.test --test (backend 전체)
```
`npm run test:game-core`로 game-core 단독 확인도 가능하다. 기준: 신규 테스트 전부 PASS + 기존 backend 테스트 전부 PASS(회귀 0).

---

## 4. 위험 요소와 대응

| 위험 | 판단 / 대응 |
| --- | --- |
| **`resyncSessionRouting` 시그니처 변경** | 호출부는 `backend/socket/socket.js:73` 단 하나, 이 함수를 부르는 테스트는 현재 0개다(grep 확인). 호출부를 같은 커밋에서 함께 고친다. 만약 io를 빠뜨리면 `socket`이 io 자리로 들어가 ENDED 분기에서 `io.to`가 없어 finalize 내부 try/catch에 걸려 조용히 로그만 남는다 — 그래서 (C)는 반드시 (B)와 함께 반영해야 한다. |
| **정리 후 결과 페이지가 스냅샷을 못 받는다** | `getSessionSnapshotForPlayer`는 `playerSession.get(uuid)`가 없으면 `NOT_A_PARTICIPANT`를 반환하고, 소켓 계층이 이를 internal-only로 보고 `INTERNAL_ERROR`로 정규화한다. 즉 ENDED 결과 페이지에서 F5하면 이제 스냅샷 하이드레이션이 실패한다. 이는 "재부착 대신 정리한다"는 요구사항의 직접적 귀결이고 frontend는 이번 슬라이스 수정 금지이므로 그대로 둔다 — 다만 결과 화면 UX(재접속 후 결과 재조회)는 후속 슬라이스에서 별도로 다뤄야 할 항목으로 남는다. 타이밍상 resync는 `registerConnectionHandlers` 안에서 클라이언트의 첫 이벤트보다 먼저 동기 실행되므로, 정리와 스냅샷 요청이 엇갈려 어떤 때는 성공하는 비결정성은 없다. |
| **재접속 소켓은 `game_ended`를 못 받는다** | finalize의 방송 대상은 `session.channelId`인데 새 소켓은 그 채널에 넣지 않는다(그게 이 변경의 요지). 의도된 동작이다. |
| **재접속 시 matchmaking Room 정리가 돈다** | 마지막 참가자 정리일 때만 `cleanupRoomStateForSessionParticipants`가 돌고, 대상은 "세션 진행 중 새로 만들거나 들어간 방"뿐이다. ENDED 결과 화면에서 새로고침하는 상황에서는 보통 비어 있어 no-op다. 요구사항이 명시적으로 `handleLeaveGameSession`과 동일하게 하라고 지정했으므로 그대로 따른다. |
| **ENDED이면서 아직 남은 참가자가 있는 세션** | `sessionDeleted:false` → 방송·channel 정리 없음. 기존 두 경로(`onDisconnect`/`handleLeaveGameSession`)와 동일한 규칙이라 "종료 방송은 한 번뿐" 계약이 유지된다. |
| **금지 영역 침범** | `isCurrentSocketForUuid`, `onDisconnect`, `handleLeaveGameSession`, `endGameSessionForPlayer`, phase 전이/판정 로직, `frontend/**`는 어느 것도 수정하지 않는다. `getActiveSessionRoutingInfo`의 변경은 반환 필드 **추가**뿐이라 기존 소비자(구조분해로 `gameId`/`channelId`만 읽음)에 영향이 없다. |

---

## 작업 지시서

| 동사 | 대상 경로 | symbol | 책임 |
| --- | --- | --- | --- |
| MODIFY | backend/game-core/gameSession.js | getActiveSessionRoutingInfo | 반환값에 phase 추가(+JSDoc 갱신) |
| MODIFY | backend/socket/gameSession.js | resyncSessionRouting | io 인자 추가, ENDED면 재부착 대신 정리·finalize |
| MODIFY | backend/socket/socket.js | registerConnectionHandlers | resyncSessionRouting 호출에 io 전달 |
| MODIFY | backend/game-core/__tests__/gameSession.test.js |  | getActiveSessionRoutingInfo phase 반환 테스트 |
| MODIFY | backend/socket/__tests__/gameSession.test.js |  | resyncSessionRouting ENDED 정리·재부착·no-op 시나리오 테스트 |
| REFERENCE | backend/socket/matchmaking.js |  | cleanupRoomStateForSessionParticipants 계약 |
| REFERENCE | backend/socket/__tests__/testHelpers/matchmakingFixtures.js |  | createFakeSocket/createFakeIo 하네스 |
| REFERENCE | backend/package.json |  | 테스트 실행 스크립트 |
