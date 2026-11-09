// 조각 2 시험: 점검·금지어 다시 읽기 방송·60초 안전망·살아나면 다시 읽기, 요청 제한·틀린 횟수 합쳐 세기
// MN-035~039·060~062·097·100 (메모리 받침 Node 2개, Redis 없이 npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const { cluster, tick, waitFor, startPair } = require('./helpers/slice2')
const maintenance = require('../../services/ops/maintenance')
const bannedWords = require('../../services/ops/bannedWords')
const reloadSync = require('../../services/ops/reloadSync')
const internalController = require('../../controllers/ops/internal')
const { createRateLimiter } = require('../../middlewares/rateLimit.middleware')
const userRepository = require('../../repositories/user')
const passwordService = require('../../services/auth/account/password')
const withdrawService = require('../../services/auth/account/withdraw')
const gameSession = require('../../game-core/gameSession')

// 다시 읽기를 가짜로 (DB 대신 넣을 상태를 정함), 부른 수 셈
function stubReloads(t, { maintenanceState = { enabled: true }, words = ['나쁜말'] } = {}) {
    const calls = { maintenance: 0, bannedWords: 0 }
    t.mock.method(maintenance, 'reloadMaintenance', async () => {
        calls.maintenance += 1
        maintenance.__setStateForTests(maintenanceState)
        return maintenance.getMaintenanceState()
    })
    t.mock.method(bannedWords, 'reloadBannedWords', async () => {
        calls.bannedWords += 1
        bannedWords.__setWordsForTests(words)
        return { count: words.length }
    })
    t.after(() => { maintenance.__setStateForTests({}); bannedWords.__setWordsForTests([]) })
    return calls
}

// 응답 흉내
function fakeRes() {
    return {
        statusCode: 200, body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this },
    }
}

test('MN-035: 한 Node에 점검 reload → 다른 Node에 ops.reload 방송, 받은 Node는 DB 다시 읽어 방 만들기 거절', async (t) => {
    const { n2 } = await startPair(t)
    const calls = stubReloads(t)
    const got = []
    n2.bus.on('ops.reload', (msg) => got.push(msg.what))
    const res = fakeRes()
    await internalController.reloadMaintenance({}, res, assert.fail)
    assert.equal(res.body.ok, true)
    await waitFor(() => got.length === 1)
    assert.deepEqual(got, ['maintenance'])
    // 거꾸로: n2가 reload를 받았다고 방송 → 이 Node가 다시 읽음 → 거절
    maintenance.__setStateForTests({})
    assert.equal(maintenance.maintenanceRejection(), null)
    await n2.bus.publish('ops.reload', { what: 'maintenance' })
    await waitFor(() => calls.maintenance === 2)
    assert.equal(maintenance.maintenanceRejection()?.code, 'MAINTENANCE')
})

test('MN-037·038·039: 금지어 reload 방송 → 두 Node 가리기·닉네임 검사가 같음', async (t) => {
    const { n2 } = await startPair(t)
    stubReloads(t, { words: ['욕설'] })
    assert.equal(bannedWords.maskBannedWords('이건 욕설임'), '이건 욕설임')
    await n2.bus.publish('ops.reload', { what: 'bannedWords' })
    await waitFor(() => bannedWords.getBannedWordCount() === 1)
    assert.equal(bannedWords.maskBannedWords('이건 욕설임'), '이건 **임')
    assert.equal(bannedWords.containsBannedWord('욕 설쟁이'), true)
})

test('MN-037: 모르는 what·내가 보낸 reload는 무시', async (t) => {
    const { n2 } = await startPair(t)
    const calls = stubReloads(t)
    await n2.bus.publish('ops.reload', { what: 'unknown' })
    await reloadSync.announceReload('maintenance')
    await tick(30)
    assert.deepEqual(calls, { maintenance: 0, bannedWords: 0 })
})

test('MN-036: reload 방송을 놓쳐도 안전망 차례에 다시 읽음 (Node 여러 개일 때만)', async (t) => {
    const calls = stubReloads(t)
    await reloadSync.__testables.safetyTick()
    assert.deepEqual(calls, { maintenance: 0, bannedWords: 0 })
    await startPair(t)
    await reloadSync.__testables.safetyTick()
    assert.deepEqual(calls, { maintenance: 1, bannedWords: 1 })
    assert.equal(maintenance.isMaintenanceActive(), true)
})

test('MN-036: 안전망 주기는 OPS_RELOAD_INTERVAL_MS (짧게 해서 실제 타이머로 확인)', async (t) => {
    await startPair(t)
    const calls = stubReloads(t)
    reloadSync.__testables.stopSafetyNet()
    reloadSync.__testables.startSafetyNet(30)
    t.after(() => reloadSync.__testables.stopSafetyNet())
    await waitFor(() => calls.maintenance >= 2)
})

test('MN-100: Redis 살아남 → 점검·금지어 바로 다시 읽기', async (t) => {
    const { hub } = await startPair(t)
    const calls = stubReloads(t)
    hub.setDown(true)
    hub.setDown(false)
    await waitFor(() => calls.maintenance === 1 && calls.bannedWords === 1)
})

// ── 요청 제한·틀린 횟수 ──

// 미들웨어 한 번 부르기 → 'next' 또는 429
async function hitLimiter(limiter, req = { ip: '1.2.3.4' }) {
    const res = fakeRes()
    let passed = false
    await limiter(req, res, () => { passed = true })
    return passed ? 'next' : res.statusCode
}

test('MN-062: HTTP 요청 제한을 Node끼리 합쳐 셈 (가입 코드·아이디 찾기·쿠폰·친구·신고·internal 모두 같은 미들웨어)', async (t) => {
    const { n2 } = await startPair(t)
    const limiter = createRateLimiter({ windowMs: 60000, max: 3, keyOf: (req) => `ip:${req.ip}` })
    // 다른 Node에서 같은 키로 두 번 (같은 제한 이름 = 창길이:최대)
    await n2.counters.hit('rl:60000:3:ip:1.2.3.4', 60000)
    await n2.counters.hit('rl:60000:3:ip:1.2.3.4', 60000)
    assert.equal(await hitLimiter(limiter), 'next')
    assert.equal(await hitLimiter(limiter), 429)
    // 이름이 다른 제한은 따로 셈 (같은 ip: 키 모양이어도 안 섞임)
    const other = createRateLimiter({ windowMs: 600000, max: 3, keyOf: (req) => `ip:${req.ip}` })
    assert.equal(await hitLimiter(other), 'next')
    const named = createRateLimiter({ windowMs: 60000, max: 1, name: 'internal', keyOf: (req) => `internal:${req.ip}` })
    assert.equal(await hitLimiter(named), 'next')
    assert.equal(await hitLimiter(named), 429)
    assert.equal((await n2.counters.peek('rl:internal:internal:1.2.3.4')).count, 2)
})

test('MN-097: Redis down 동안 요청 제한은 Node 메모리로 계속 셈 (막히지도 다 풀리지도 않음)', async (t) => {
    const { hub } = await startPair(t)
    hub.setDown(true)
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, keyOf: (req) => `ip:${req.ip}` })
    assert.equal(await hitLimiter(limiter), 'next')
    assert.equal(await hitLimiter(limiter), 'next')
    assert.equal(await hitLimiter(limiter), 429)
    assert.equal((await cluster.counters.peek('rl:60000:2:ip:1.2.3.4')).shared, false)
})

test('MN-062: 단일 모드는 예전처럼 서버 메모리 + 넘긴 now로 창 셈', async () => {
    let nowMs = 1000
    const limiter = createRateLimiter({ windowMs: 100, max: 1, now: () => nowMs, keyOf: () => 'k' })
    assert.equal(await hitLimiter(limiter), 'next')
    assert.equal(await hitLimiter(limiter), 429)
    nowMs += 100
    assert.equal(await hitLimiter(limiter), 'next')
})

test('MN-060: 현재 비번 틀린 횟수를 두 Node 합쳐 셈 (wrong:pw:<uuid>)', async (t) => {
    const { n2 } = await startPair(t)
    const uuid = 'aaaaaaaa-0000-4000-8000-000000000060'
    t.mock.method(userRepository, 'withTransaction', async () => ({ ok: false }))
    for (let i = 0; i < 4; i += 1) await n2.counters.hit(`wrong:pw:${uuid}`, 15 * 60 * 1000)
    assert.deepEqual(await passwordService.changePassword({ uuid, currentPassword: 'x', newPassword: 'y' }), { ok: false })
    assert.deepEqual(await passwordService.changePassword({ uuid, currentPassword: 'x', newPassword: 'y' }), { ok: false, locked: true })
    assert.equal((await n2.counters.peek(`wrong:pw:${uuid}`)).count, 5)
})

test('MN-061: 탈퇴 틀린 횟수를 두 Node 합쳐 셈 (wrong:wd:<uuid>)', async (t) => {
    const { n2 } = await startPair(t)
    const uuid = 'aaaaaaaa-0000-4000-8000-000000000061'
    t.mock.method(gameSession, 'isMatchmakingBlocked', () => false)
    t.mock.method(userRepository, 'withTransaction', async () => 'WITHDRAW_PASSWORD_INVALID')
    for (let i = 0; i < 4; i += 1) await n2.counters.hit(`wrong:wd:${uuid}`, 15 * 60 * 1000)
    await assert.rejects(withdrawService.withdrawAccount({ uuid, password: 'x' }), { code: 'WITHDRAW_PASSWORD_INVALID' })
    await assert.rejects(withdrawService.withdrawAccount({ uuid, password: 'x' }), { status: 429, code: 'WITHDRAW_LOCKED' })
})
