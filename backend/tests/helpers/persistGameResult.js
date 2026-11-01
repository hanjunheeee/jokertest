// 시험 전용 판 저장 도우미 파일, 판 → 기록 만들어 저장 (옛 저장소 persistGameResult와 같은 동작)
// DB 시험들이 부름, 시험이 저장소 persistGameResultRecord·game-core를 갈아끼워도 먹게 모듈 객체로 부름
const gameSessionCore = require('../../game-core/gameSession')
const gameResultRepository = require('../../repositories/game/result')

// async 유지: 기록 만들다 던져도 거절된 Promise로 나가게 (assert.rejects 쓰는 시험 있음)
async function persistGameResult(session, { completed, disconnectedUuid } = {}) {
    return gameResultRepository.persistGameResultRecord(
        gameSessionCore.buildGameResultRecord(session, { completed, disconnectedUuid }),
    )
}

module.exports = { persistGameResult }
