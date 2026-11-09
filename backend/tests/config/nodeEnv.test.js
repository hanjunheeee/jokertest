// 운영 판정·시작 거부 시험 (BE-028), 운영 판정 함수 하나·모르는 NODE_ENV 시작 거부·시작 가능 표시와 실제 시작 인원 맞춤
// config/nodeEnv·requiredEnv·matchmaking config·방 정보 시작 가능 판정을 봄
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@127.0.0.1:1/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const { isProduction } = require('../../config/nodeEnv')
const { assertRequiredEnv, isStartupFatal } = require('../../config/requiredEnv')
const matchmakingConfig = require('../../socket/matchmaking/core/config')
const { computeCanStart } = require('../../socket/matchmaking/room/view')

const FULL = { DATABASE_URL: 'x', JWT_SECRET: 'y', FRONTEND_URL: 'z' }

// 시험 하나 동안만 env 바꾸기 (undefined는 지움)
const withEnv = (t, values) => {
    const before = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]))
    for (const [k, v] of Object.entries(values)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
    }
    t.after(() => {
        for (const [k, v] of Object.entries(before)) {
            if (v === undefined) delete process.env[k]
            else process.env[k] = v
        }
    })
}

// 던진 오류 잡기
const caught = (fn) => {
    try { fn() } catch (error) { return error }
    return null
}

test('BE-028: 운영 판정은 정확히 production일 때만', () => {
    assert.equal(isProduction({ NODE_ENV: 'production' }), true)
    for (const value of [undefined, '', 'development', 'test', 'prod', 'Production']) {
        assert.equal(isProduction({ NODE_ENV: value }), false, String(value))
    }
})

test('BE-028: 모르는 NODE_ENV는 운영이 아니어도 시작 거부 (오타로 개발 규칙이 운영에 새지 않게)', () => {
    for (const value of ['prod', 'staging', ' production ']) {
        const error = caught(() => assertRequiredEnv({ ...FULL, NODE_ENV: value }))
        assert.ok(error, value)
        assert.equal(isStartupFatal(error, { ...FULL, NODE_ENV: value }), true, value)
    }
})

// .env 예시의 `NODE_ENV=`(빈 값) 그대로 써도 개발로 켜짐 (값 없음과 같게, 2026-11-09)
test('NODE_ENV 빈 글자·빈칸은 값 없음과 같음: 시작 거부 안 하고 운영도 아님', () => {
    for (const value of ['', '   ']) {
        assert.equal(caught(() => assertRequiredEnv({ ...FULL, NODE_ENV: value })), null, JSON.stringify(value))
        assert.equal(isProduction({ NODE_ENV: value }), false)
    }
})

test('BE-028: 필수 값 빠짐은 운영만 시작 거부, 개발·값 없음은 경고로 계속', () => {
    const error = caught(() => assertRequiredEnv({ NODE_ENV: 'development' }))
    assert.ok(error)
    assert.equal(isStartupFatal(error, { NODE_ENV: 'development' }), false)
    assert.equal(isStartupFatal(error, {}), false)
    assert.equal(isStartupFatal(error, { NODE_ENV: 'production' }), true)
})

test('시작 인원: 운영은 정원과 상관없이 5명, 개발은 개발 최소와 정원 중 작은 것', (t) => {
    withEnv(t, { NODE_ENV: 'production', GAME_DEV_MIN_PLAYERS: '1' })
    assert.equal(matchmakingConfig.getRequiredPlayers(4), 5)
    assert.equal(matchmakingConfig.getRequiredPlayers(10), 5)
    assert.equal(matchmakingConfig.getRequiredPlayers(undefined), 5)
    process.env.NODE_ENV = 'development'
    process.env.GAME_DEV_MIN_PLAYERS = '3'
    assert.equal(matchmakingConfig.getRequiredPlayers(2), 2)
    assert.equal(matchmakingConfig.getRequiredPlayers(8), 3)
    assert.equal(matchmakingConfig.getRequiredPlayers(undefined), 3)
})

// 전원 준비한 방 (입장 처리 중 없음)
const readyRoom = (count, maxPlayers) => ({
    id: `can-start-${count}-${maxPlayers}`,
    settings: { maxPlayers, jokerCount: 1 },
    players: new Map(Array.from({ length: count }, (_, i) => [`p${i}`, { uuid: `p${i}`, isReady: true }])),
})

test('시작 가능 표시: 운영에서 정원 4 방 4명 전원 준비여도 false (서버 시작 판정과 같음)', (t) => {
    withEnv(t, { NODE_ENV: 'production', GAME_DEV_MIN_PLAYERS: '1' })
    assert.equal(computeCanStart(readyRoom(4, 4)), false)
})
