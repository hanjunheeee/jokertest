// 전적 저장 재시도 시험 (known 2장 persist.js:68-81): 제약 위반처럼 다시 해도 안 되는 실패는 끝없이 재시도하지 않음
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')
const gameRecordService = require('../../../services/game/record')
const gameAchievementService = require('../../../services/game/achievementHooks')
const gameSessionCore = require('../../../game-core/gameSession')

// 재시도 타이머 기록만 하는 가짜 (실제로 안 돎)
function fakeTimers() {
    const scheduled = []
    return {
        scheduled,
        setTimeoutFn: (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length },
        clearTimeoutFn: () => {},
    }
}

function makeSession(id) {
    const players = Array.from({ length: 5 }, (_, i) => ({ uuid: `rp-${id}-${i}`, nickname: `n${i}`, isReady: true }))
    const room = { id: `room-${id}`, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount: 1 } }
    return gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.5 }).session
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test.beforeEach(() => {
    gameRecordService.__resetTerminalPersistForTests()
    gameAchievementService.__setEvaluateAchievementsForTests(async () => {})
})
test.afterEach(() => {
    gameRecordService.__resetTerminalPersistForTests()
    gameRecordService.__setGameResultPersistForTests()
    gameAchievementService.__setEvaluateAchievementsForTests()
})

test('제약 위반 실패는 재시도 예약 없이 저장 작업을 끝낸다', async () => {
    const timers = fakeTimers()
    gameRecordService.__setTerminalPersistTimersForTests(timers)
    let attempts = 0
    gameRecordService.__setGameResultPersistForTests(async () => {
        attempts += 1
        const err = new Error('dup')
        err.name = 'SequelizeUniqueConstraintError'
        throw err
    })
    gameRecordService.persistTerminalSession(makeSession('perm'), { completed: false })
    await flush()
    assert.equal(attempts, 1)
    assert.equal(timers.scheduled.length, 0, '다시 해도 안 되는 실패라 재시도 안 함')
    assert.deepEqual(gameRecordService.__getTerminalPersistRunsForTests(), [])
})

test('연결 끊김 같은 일시 실패는 그대로 재시도를 예약한다', async () => {
    const timers = fakeTimers()
    gameRecordService.__setTerminalPersistTimersForTests(timers)
    gameRecordService.__setGameResultPersistForTests(async () => {
        const err = new Error('lost')
        err.name = 'SequelizeConnectionError'
        throw err
    })
    gameRecordService.persistTerminalSession(makeSession('temp'), { completed: false })
    await flush()
    assert.equal(timers.scheduled.length, 1)
    assert.equal(gameRecordService.__getTerminalPersistRunsForTests().length, 1)
})
