// 서버 켤 때 접속 상태 되돌리기 시험 (BE-015), 재시작 전 ONLINE 줄은 OFFLINE으로, 켠 뒤 새로 붙은 줄은 그대로
// 서버 이름(SERVER_ID)별: 자기 서버 줄 + 1시간 넘은 이름 없는 옛 줄만 되돌림, 다른 서버 접속자는 그대로 (서버 여러 대 대비)
// 가짜 OnlinePresence 모델로 봄 (진짜 DB 안 씀)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@127.0.0.1:1/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const db = require('../../../models')
const presenceStatus = require('../../../services/presence/status')
const { getServerId, DEFAULT_SERVER_ID } = require('../../../config/serverId')
const cluster = require('../../../cluster')

const { Op } = db.Sequelize

// update 조건(status ≠ OFFLINE, 마지막 활동 < 기준 시각, 서버 이름 같음 또는 없음)을 흉내 내는 가짜 모델
function installFakePresence(t, rows) {
    const original = db.OnlinePresence
    const upserts = []
    db.OnlinePresence = {
        update: async (values, { where }) => {
            let changed = 0
            // 갈래마다 (서버 이름 같음 + 그 갈래 기준 시각 전)
            for (const row of rows) {
                const notOffline = row.status !== where.status[Op.ne]
                const hit = where[Op.or].some((branch) =>
                    (row.server_id ?? null) === branch.server_id && row.last_active_at < branch.last_active_at[Op.lt])
                if (notOffline && hit) {
                    Object.assign(row, values)
                    changed += 1
                }
            }
            return [changed]
        },
        upsert: async (row) => { upserts.push(row); return [row, true] },
    }
    t.after(() => { db.OnlinePresence = original })
    return { upserts }
}

// 이 Node 이름은 cluster 한 곳에서 받음 → 환경값 바꾼 뒤 cluster를 닫아야 새 값으로 다시 읽음 (진짜 서버는 켤 때 한 번)
async function useServerIdEnv(t, value) {
    const saved = process.env.SERVER_ID
    process.env.SERVER_ID = value
    await cluster.close()
    t.after(async () => {
        if (saved === undefined) delete process.env.SERVER_ID; else process.env.SERVER_ID = saved
        await cluster.close()
    })
}

const BOOT_AT = new Date('2026-11-09T10:00:00Z')
const before = (minutes) => new Date(BOOT_AT.getTime() - minutes * 60 * 1000)

test('BE-015: 켤 때 기준 시각 전 ONLINE 줄은 OFFLINE, 켠 뒤 붙은 줄은 ONLINE 그대로 (서버 한 대 = 이름 기본값)', async (t) => {
    const rows = [
        { user_id: 'old-online', status: 'ONLINE', last_active_at: before(60), server_id: DEFAULT_SERVER_ID },
        { user_id: 'old-ingame', status: 'IN_GAME', last_active_at: before(30), server_id: DEFAULT_SERVER_ID },
        { user_id: 'already-off', status: 'OFFLINE', last_active_at: before(120), server_id: DEFAULT_SERVER_ID },
        { user_id: 'new-online', status: 'ONLINE', last_active_at: new Date(BOOT_AT.getTime() + 1000), server_id: DEFAULT_SERVER_ID },
    ]
    installFakePresence(t, rows)

    const changed = await presenceStatus.resetPresencesOnBoot(BOOT_AT, DEFAULT_SERVER_ID)

    assert.equal(changed, 2)
    assert.deepEqual(rows.map((r) => [r.user_id, r.status]), [
        ['old-online', 'OFFLINE'],
        ['old-ingame', 'OFFLINE'],
        ['already-off', 'OFFLINE'],
        ['new-online', 'ONLINE'],
    ])
})

test('서버 여러 대: 켠 서버 이름 줄 + 1시간 넘은 이름 없는 옛 줄만 OFFLINE, 다른 서버 접속자는 그대로', async (t) => {
    const rows = [
        { user_id: 'mine', status: 'ONLINE', last_active_at: before(10), server_id: 'game-1' },
        { user_id: 'legacy', status: 'ONLINE', last_active_at: before(61), server_id: null },
        { user_id: 'legacy-undefined', status: 'ONLINE', last_active_at: before(120) },
        { user_id: 'other-server', status: 'ONLINE', last_active_at: before(10), server_id: 'game-2' },
    ]
    installFakePresence(t, rows)

    const changed = await presenceStatus.resetPresencesOnBoot(BOOT_AT, 'game-1')

    assert.equal(changed, 3)
    assert.deepEqual(rows.map((r) => [r.user_id, r.status]), [
        ['mine', 'OFFLINE'],
        ['legacy', 'OFFLINE'],
        ['legacy-undefined', 'OFFLINE'],
        ['other-server', 'ONLINE'],
    ])
})

// 브라우저 시험 security S-01 (2026-11-09): 따로 띄운 서버가 켜질 때 막 붙은 이름 없는 줄까지 OFFLINE
test('이름 없는 줄은 1시간 안에 활동했으면 안 건드림 (어느 서버 접속인지 모름)', async (t) => {
    const rows = [
        { user_id: 'legacy-fresh', status: 'ONLINE', last_active_at: before(10), server_id: null },
        { user_id: 'legacy-59', status: 'IN_GAME', last_active_at: before(59) },
        { user_id: 'legacy-old', status: 'ONLINE', last_active_at: before(90), server_id: null },
    ]
    installFakePresence(t, rows)

    assert.equal(await presenceStatus.resetPresencesOnBoot(BOOT_AT, 'game-1'), 1)
    assert.deepEqual(rows.map((r) => [r.user_id, r.status]), [
        ['legacy-fresh', 'ONLINE'],
        ['legacy-59', 'IN_GAME'],
        ['legacy-old', 'OFFLINE'],
    ])
})

test('서버 이름 안 넘기면 SERVER_ID 환경값 이름으로 되돌림', async (t) => {
    await useServerIdEnv(t, 'game-7')
    const rows = [
        { user_id: 'mine', status: 'ONLINE', last_active_at: before(5), server_id: 'game-7' },
        { user_id: 'other', status: 'ONLINE', last_active_at: before(5), server_id: DEFAULT_SERVER_ID },
    ]
    installFakePresence(t, rows)

    assert.equal(await presenceStatus.resetPresencesOnBoot(BOOT_AT), 1)
    assert.deepEqual(rows.map((r) => r.status), ['OFFLINE', 'ONLINE'])
})

test('접속 상태 저장은 이 서버 이름을 같이 적음', async (t) => {
    await useServerIdEnv(t, 'game-3')
    const { upserts } = installFakePresence(t, [])

    await presenceStatus.setPresence('u-1', 'ONLINE')

    assert.equal(upserts.length, 1)
    assert.equal(upserts[0].user_id, 'u-1')
    assert.equal(upserts[0].status, 'ONLINE')
    assert.equal(upserts[0].server_id, 'game-3')
})

test('서버 이름: 비었거나 모양 틀리면 기본값 main, 맞으면 앞뒤 빈칸 빼고 그대로', () => {
    assert.equal(getServerId({}), 'main')
    assert.equal(getServerId({ SERVER_ID: '' }), 'main')
    assert.equal(getServerId({ SERVER_ID: '   ' }), 'main')
    assert.equal(getServerId({ SERVER_ID: 'game 1' }), 'main')
    assert.equal(getServerId({ SERVER_ID: 'x'.repeat(65) }), 'main')
    assert.equal(getServerId({ SERVER_ID: ' game-1.kr_a ' }), 'game-1.kr_a')
})

test('단일 모드: 저장에 쓰는 이름 = cluster.serverId() = 예전 SERVER_ID 읽기 값 (안 넣으면 main)', async (t) => {
    for (const value of [undefined, '', 'game 1', ' game-9 ']) {
        const saved = process.env.SERVER_ID
        if (value === undefined) delete process.env.SERVER_ID; else process.env.SERVER_ID = value
        await cluster.close()
        const { upserts } = installFakePresence(t, [])
        await presenceStatus.setPresence('u-2', 'ONLINE')
        assert.equal(cluster.mode(), 'off')
        assert.equal(cluster.serverId(), getServerId(process.env))
        assert.equal(upserts[0].server_id, getServerId(process.env))
        if (saved === undefined) delete process.env.SERVER_ID; else process.env.SERVER_ID = saved
        await cluster.close()
    }
    assert.equal(getServerId({}), DEFAULT_SERVER_ID)
})
