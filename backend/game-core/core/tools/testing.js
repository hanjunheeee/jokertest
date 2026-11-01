// 시험 전용 장부 손잡이 파일
// 장부 비우기·복사·판만 지우기, 시험만 gameSession.js의 __ 이름으로 사용
// gameSession.js에 있던 것, 장부 직접 만지는 거라 core로 옮김
const { gameSessions, playerSession, roomGameSession } = require('../registry/state')
const { setObserver } = require('./observer')

// 시험용: 판 장부 3개 비우고 관찰자도 뺌 (시험마다 처음 상태로)
function __resetStateForTests() {
    gameSessions.clear()
    playerSession.clear()
    roomGameSession.clear()
    setObserver(null)
}

// 시험용: 장부 3개를 배열로 복사해서 돌려줌 (사람 Map도 배열로 펼침)
function __getStateSnapshotForTests() {
    return {
        gameSessions: [...gameSessions.entries()].map(([id, s]) => [id, { ...s, players: [...s.players.entries()] }]),
        playerSession: [...playerSession.entries()],
        roomGameSession: [...roomGameSession.entries()],
    }
}

// 시험용: 판 장부에서만 판 지움 (다른 장부는 일부러 안 맞게 남김)
function __deleteGameSessionOnlyForTests(gameId) {
    gameSessions.delete(gameId)
}

module.exports = { __resetStateForTests, __getStateSnapshotForTests, __deleteGameSessionOnlyForTests }
