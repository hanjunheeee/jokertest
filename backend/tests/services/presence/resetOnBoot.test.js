// 서버 켤 때 접속 상태 되돌리기 시험 (BE-015), 재시작 전 ONLINE 줄은 OFFLINE으로, 켠 뒤 새로 붙은 줄은 그대로
// 가짜 OnlinePresence 모델로 봄 (진짜 DB 안 씀)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@127.0.0.1:1/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const db = require('../../../models')
const presenceStatus = require('../../../services/presence/status')

const { Op } = db.Sequelize

// update 조건(status ≠ OFFLINE, 마지막 활동 < 기준 시각)을 흉내 내는 가짜 모델
function installFakePresence(t, rows) {
    const original = db.OnlinePresence
    db.OnlinePresence = {
        update: async (values, { where }) => {
            let changed = 0
            for (const row of rows) {
                const notOffline = row.status !== where.status[Op.ne]
                const stale = row.last_active_at < where.last_active_at[Op.lt]
                if (notOffline && stale) {
                    Object.assign(row, values)
                    changed += 1
                }
            }
            return [changed]
        },
    }
    t.after(() => { db.OnlinePresence = original })
}

test('BE-015: 켤 때 기준 시각 전 ONLINE 줄은 OFFLINE, 켠 뒤 붙은 줄은 ONLINE 그대로', async (t) => {
    const bootAt = new Date('2026-11-09T10:00:00Z')
    const rows = [
        { user_id: 'old-online', status: 'ONLINE', last_active_at: new Date('2026-11-09T09:00:00Z') },
        { user_id: 'old-ingame', status: 'IN_GAME', last_active_at: new Date('2026-11-09T09:30:00Z') },
        { user_id: 'already-off', status: 'OFFLINE', last_active_at: new Date('2026-11-09T08:00:00Z') },
        { user_id: 'new-online', status: 'ONLINE', last_active_at: new Date('2026-11-09T10:00:01Z') },
    ]
    installFakePresence(t, rows)

    const changed = await presenceStatus.resetPresencesOnBoot(bootAt)

    assert.equal(changed, 2)
    assert.deepEqual(rows.map((r) => [r.user_id, r.status]), [
        ['old-online', 'OFFLINE'],
        ['old-ingame', 'OFFLINE'],
        ['already-off', 'OFFLINE'],
        ['new-online', 'ONLINE'],
    ])
})
