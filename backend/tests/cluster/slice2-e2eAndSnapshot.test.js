// 조각 2 시험: e2e 훅이 방·판 Node 것을 읽고 바꿈, 동시 접속 기록 server_id, 마이그레이션 0030
// MN-076·126~128 + 0030 두 번 돌리기 (메모리 받침 Node 2개, 디렉터리 값은 시험이 직접 넣음)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const { cluster, waitFor, startPair } = require('./helpers/slice2')
const remoteHooks = require('../../socket/e2e/remoteHooks')
const gameHooks = require('../../socket/e2e/gameHooks')
const { captureSnapshot } = require('../../services/presence/concurrency/snapshot')
const migration0030 = require('../../db/migrations/0030-add-concurrent-snapshot-server-id')

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'
const GAME = 'eeeeeeee-0000-4000-8000-00000000000e'

const keys = () => cluster.directory.keys()

// ── e2e 훅 ──

test('MN-126: e2e 방 역할 예약 → 방 Node에도 들어감 (전 Node에 넣고 방 Node가 씀)', async (t) => {
    const { n2 } = await startPair(t)
    const got = []
    n2.rpc.register('e2e.setRolePresets', (args) => { got.push(args); return 1 })
    t.after(() => gameHooks.clearRolePresets())
    const result = await remoteHooks.setRolePresets({ [A]: 'JOKER' }, { roomId: 'room-126' })
    assert.deepEqual(result, { size: 1, partial: false })
    assert.deepEqual(got, [{ presets: { [A]: 'JOKER' }, roomId: 'room-126' }])
    await assert.rejects(remoteHooks.setRolePresets({ [A]: 'NOPE' }), /모르는 역할/)
})

test('MN-126: 사람 예약을 쓴 Node는 다른 Node 예약을 지움 (뒷판에 잘못 안 쓰임)', async (t) => {
    const { n2 } = await startPair(t)
    const cleared = []
    n2.rpc.register('e2e.clear', (args) => { cleared.push(args); return { ok: true } })
    t.after(() => gameHooks.clearRolePresets())
    gameHooks.setRolePresets({ [A]: 'JOKER' })
    const before = process.env.E2E_HOOKS
    process.env.E2E_HOOKS = '1'
    t.after(() => { if (before === undefined) delete process.env.E2E_HOOKS; else process.env.E2E_HOOKS = before })
    gameHooks.applyRolePresets({ id: 'g', roomId: 'r', players: new Map([[A, { uuid: A, role: 'CITIZEN' }]]) })
    await waitFor(() => cleared.length === 1)
    assert.deepEqual(cleared[0], { uuids: [A] })
})

test('MN-127: e2e advance → 판 Node가 돌림', async (t) => {
    const { n2 } = await startPair(t)
    await n2.directory.write(keys().game(GAME), 'n2', { ttlMs: 60000 })
    n2.rpc.register('e2e.advance', ({ gameId }) => (gameId === GAME
        ? { ok: true, fired: 'DAY', before: 'DAY', after: 'TRIBUNAL' }
        : { ok: false, code: 'SESSION_NOT_FOUND' }))
    const { value, node } = await remoteHooks.advance(GAME)
    assert.equal(node, 'n2')
    assert.deepEqual([value.ok, value.fired], [true, 'DAY'])
    const missing = await remoteHooks.advance('ffffffff-0000-4000-8000-00000000000f')
    assert.deepEqual([missing.value.code, missing.node], ['SESSION_NOT_FOUND', null])
})

test('MN-128: e2e users/:uuid/game → 판 Node 답, node 칸', async (t) => {
    const { n2 } = await startPair(t)
    await n2.directory.write(keys().loc(A), { node: 'n2', bootEpoch: n2.bootEpoch, kind: 'game', id: GAME }, { ttlMs: 60000 })
    n2.rpc.register('e2e.describeUserGame', ({ uuid }) => (uuid === A ? { gameId: GAME, players: [] } : null))
    n2.rpc.register('e2e.describeUserRoom', () => null)
    assert.deepEqual(await remoteHooks.describeUserGame(A), { value: { gameId: GAME, players: [] }, node: 'n2' })
    assert.deepEqual(await remoteHooks.describeUserGame(B), { value: null, node: null })
    assert.deepEqual(await remoteHooks.describeUserRoom(A), { value: null, node: null })
})

test('MN-128: 단일 모드 e2e 읽기는 이 Node 장부만 (예전 그대로 + node 칸)', async () => {
    await cluster.close()
    assert.deepEqual(await remoteHooks.describeUserGame(A), { value: null, node: null })
    assert.deepEqual(await remoteHooks.setRolePresets({}, {}), { size: 0, partial: false })
})

// ── 동시 접속 기록 server_id ──

test('MN-076: 동시 접속 기록에 server_id (Node마다 한 줄), 단일 모드 줄 모양은 그대로', async (t) => {
    const rows = []
    const model = { create: async (row) => rows.push(row) }
    const snapshot = { participantUuids: new Set(), room_count: 0 }
    await startPair(t)
    assert.equal(await captureSnapshot({ onlineUsers: new Map([[A, 's']]), getGameSnapshot: () => snapshot, model }), true)
    assert.equal(rows[0].server_id, 'n1')
    await cluster.close()
    await captureSnapshot({ onlineUsers: new Map(), getGameSnapshot: () => snapshot, model })
    assert.equal('server_id' in rows[1], false)
})

test('0030: concurrent_snapshots.server_id 더하기, 두 번 돌려도 안전, down은 있을 때만', async () => {
    const columns = { id: {}, captured_at: {} }
    const calls = []
    const qi = {
        describeTable: async () => ({ ...columns }),
        addColumn: async (table, column, spec) => { calls.push(['add', table, column, spec.allowNull]); columns[column] = spec },
        removeColumn: async (table, column) => { calls.push(['remove', table, column]); delete columns[column] },
    }
    const Sequelize = { STRING: (n) => `STRING(${n})` }
    await assert.rejects(migration0030.verify(qi), /0030/)
    await migration0030.up(qi, Sequelize)
    await migration0030.up(qi, Sequelize)
    await migration0030.verify(qi)
    assert.deepEqual(calls, [['add', 'concurrent_snapshots', 'server_id', true]])
    await migration0030.down(qi)
    await migration0030.down(qi)
    assert.equal(calls.length, 2)
    const { MIGRATIONS } = require('../../scripts/migrate-db')
    assert.equal(MIGRATIONS.at(-1).name, '0030-add-concurrent-snapshot-server-id')
})
