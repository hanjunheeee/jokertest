// 판 인원 규칙 시험 (BE-001·BE-037): 운영은 5~10명·광대 1명 이상, 개발은 2명·광대 0명 판도 허용
const test = require('node:test')
const assert = require('node:assert/strict')
const gameSession = require('../../../game-core/gameSession')
const { makePlayer, makeRoom } = require('../../helpers/gameSession.testUtils')

// NODE_ENV 잠깐 바꿔 돌리고 원래대로
function withNodeEnv(value, run) {
    const original = process.env.NODE_ENV
    if (value === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = value
    try {
        return run()
    } finally {
        if (original === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = original
    }
}

function roomOf(count, jokerCount = 1, id = `room-range-${count}-${jokerCount}`) {
    return makeRoom({ id, players: Array.from({ length: count }, (_, i) => makePlayer(`${id}-p${i}`)), jokerCount })
}

test.beforeEach(() => gameSession.__resetStateForTests())
test.afterEach(() => gameSession.__resetStateForTests())

test('운영: 4명 판은 game-core가 PLAYER_COUNT_OUT_OF_RANGE로 거절한다 (마지막 막)', () => {
    withNodeEnv('production', () => {
        const prepared = gameSession.prepareGameSession(roomOf(4))
        assert.equal(prepared.ok, false)
        assert.equal(prepared.reason, 'PLAYER_COUNT_OUT_OF_RANGE')
    })
})

test('운영: 5명·10명 판은 받고 11명은 거절한다', () => {
    withNodeEnv('production', () => {
        const { validateSessionInput } = gameSession.__testables
        const players = (n) => Array.from({ length: n }, (_, i) => makePlayer(`r-${n}-${i}`))
        assert.equal(validateSessionInput(players(5), 1).ok, true)
        assert.equal(validateSessionInput(players(10), 2).ok, true)
        assert.equal(validateSessionInput(players(11), 2).reason, 'PLAYER_COUNT_OUT_OF_RANGE')
    })
})

test('운영: 광대 0명 판은 INVALID_JOKER_COUNT로 거절한다', () => {
    withNodeEnv('production', () => {
        const { validateSessionInput } = gameSession.__testables
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`z-${i}`))
        assert.equal(validateSessionInput(players, 0).reason, 'INVALID_JOKER_COUNT')
    })
})

test('운영: commitGameSession도 5명 미만 판을 넣지 않는다', () => {
    const prepared = withNodeEnv(undefined, () => gameSession.prepareGameSession(roomOf(4)))
    assert.equal(prepared.ok, true)
    withNodeEnv('production', () => {
        assert.throws(() => gameSession.commitGameSession(prepared.session), /지원하지 않는 인원/)
    })
})

test('개발: 2명 판·광대 0명 판은 개발 편의로 그대로 받는다', () => {
    withNodeEnv(undefined, () => {
        const { validateSessionInput } = gameSession.__testables
        const players = [makePlayer('d-1'), makePlayer('d-2')]
        assert.equal(validateSessionInput(players, 1).ok, true)
        assert.equal(validateSessionInput(players, 0).ok, true)
    })
})
