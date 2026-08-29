const gameSessionCore = require("../game-core/gameSession");
const gameSessionSocketLayer = require("../socket/gameSession");

/**
 * 현재 접속 중인 고유 플레이어 uuid 집합 — 동시 접속 통계의 단일 진실원입니다.
 *
 * 소켓 계층의 onlineUsers Map(uuid → canonical socket.id)과 같은 uuid 단위 키를 쓰므로,
 * 같은 계정이 여러 탭·기기로 접속해도 항목은 언제나 하나입니다(AC-01). 이 Set을 바꾸는 곳은
 * socket.js의 handleConnection/handleDisconnect 두 곳뿐이며, 그 두 지점은 registry를
 * set/delete하는 바로 그 동기 구간에서 이 모듈을 호출합니다.
 *
 * 모듈 스코프 인메모리 상태라 프로세스가 죽으면 함께 사라집니다 — 부팅 시 어떤 저장소에서도
 * 복원하지 않는 것이 이 모듈의 계약입니다(AC-04). concurrent_snapshots 테이블은 과거 기록일
 * 뿐이고, 그것을 읽어 카운터를 되살리면 재시작 직후 유령 접속자가 생깁니다.
 *
 * 이 모듈은 DB를 전혀 만지지 않습니다. 저장은 concurrentSnapshot.scheduler가 이 상태를
 * 읽어서 따로 수행하므로, 저장이 실패해도 카운터·연결·해제 경로는 영향을 받지 않습니다(AC-03).
 */
const connectedUuids = new Set();

/**
 * 접속 전이 — 그 uuid를 접속 집합에 넣습니다. 같은 uuid의 두 번째 소켓은 이미 있는 항목을
 * 다시 넣을 뿐이라 total이 늘지 않습니다(Set의 멱등성이 곧 고유 카운팅입니다).
 *
 * DB도 타이머도 건드리지 않는 순수 동기 연산이라 절대 throw하지 않고, 소켓 핸들러의 await
 * 체인 밖(첫 await 이전)에서 끝납니다.
 */
function onConnect(uuid) {
    if (typeof uuid !== "string" || uuid === "") return connectedUuids.size;
    connectedUuids.add(uuid);
    return connectedUuids.size;
}

/**
 * 해제 전이 — 그 uuid를 접속 집합에서 뺍니다. 호출자(socket.js의 handleDisconnect)가 이미
 * forcedLogout·canonical 소켓 검사를 통과한 뒤에만 부르므로, 교체된 낡은 소켓의 지연
 * disconnect가 살아있는 새 소켓의 카운트를 지우지 않습니다.
 */
function onDisconnect(uuid) {
    connectedUuids.delete(uuid);
    return connectedUuids.size;
}

/**
 * 접속 중인 uuid 가운데 활성 GameSession에 속한 사람 수를 셉니다.
 *
 * 별도의 in_game 버킷을 따로 들고 다니지 않고 game-core registry에서 매번 유도하는 이유는,
 * 그래야 게임 시작·종료·중도 이탈 같은 모든 전이에서 in_game이 정의상 항상 맞기 때문입니다 —
 * 버킷을 손으로 옮기면 전이 훅을 하나라도 빠뜨린 순간 total = lobby + in_game이 깨집니다.
 * 끊긴 참가자(재접속 유예 중)는 connectedUuids에 없으므로 자연히 in_game에서도 빠집니다.
 */
function countInGamePlayers() {
    let inGame = 0;
    for (const uuid of connectedUuids) {
        if (gameSessionCore.getActiveSessionRoutingInfo(uuid)) inGame += 1;
    }
    return inGame;
}

/**
 * 현재 동시 접속 상태를 반환합니다 — { total, lobby, in_game, room_count }.
 *
 * 코드에서만 호출하는 내부 조회 함수입니다(AC-05). HTTP 라우트에 연결하거나 소켓 이벤트로
 * broadcast하지 마세요 — 이 값은 운영 지표일 뿐 클라이언트에 공개할 정보가 아닙니다.
 *
 * lobby를 total에서 in_game을 빼서 만들기 때문에 total = lobby + in_game은 계산 구조상 항상
 * 성립합니다(AC-06). 세 값 모두 같은 스냅샷 시점에서 유도되므로 서로 어긋날 수 없습니다.
 */
function getConcurrentState() {
    const total = connectedUuids.size;
    const inGame = countInGamePlayers();

    return {
        total,
        lobby: total - inGame,
        in_game: inGame,
        room_count: gameSessionSocketLayer.getActiveGameSessionCount(),
    };
}

/**
 * 테스트 전용: 접속 집합을 비웁니다(gameSession.js의 __resetStateForTests와 같은 규약).
 * "프로세스 재시작 직후"를 테스트에서 재현하는 유일한 통로입니다. 런타임 코드에서는
 * 호출하지 마세요.
 */
function __resetConcurrentStateForTests() {
    connectedUuids.clear();
}

/** 테스트 전용: 접속 집합의 복제본을 반환합니다(라이브 참조를 넘기지 않습니다). */
function __getConnectedUuidsForTests() {
    return new Set(connectedUuids);
}

module.exports = {
    onConnect,
    onDisconnect,
    getConcurrentState,
    __resetConcurrentStateForTests,
    __getConnectedUuidsForTests,
};
