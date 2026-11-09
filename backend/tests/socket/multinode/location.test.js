// 위치 맞추기 시험 (MN-073·074·099·103), 장부가 바뀌면 loc:<uuid>·game:<id>가 맞게 바뀌는지
// 메모리 Redis 위 n1(이 프로세스)·n2, 장부는 진짜 대기방·판 장부와 판 장부 쓰기 함수
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const { cluster, waitFor, startTwoNodes, readKey } = require('./setup')
const locationSync = require('../../../socket/connection/locationSync')
const { playerRoom } = require('../../../socket/matchmaking/core/state')
const { gameSessions, playerSession, roomGameSession } = require('../../../game-core/core/registry/state')
const registryWrite = require('../../../game-core/core/registry/write')

const keys = () => cluster.directory.keys()

// 장부 비우고 맞추기 켜기, 끝나면 떼기
function startSync(t) {
    playerRoom.clear(); playerSession.clear(); gameSessions.clear(); roomGameSession.clear()
    locationSync.__stopLocationSyncForTests()
    locationSync.startLocationSync()
    t.after(() => {
        locationSync.__stopLocationSyncForTests()
        playerRoom.clear(); playerSession.clear(); gameSessions.clear(); roomGameSession.clear()
    })
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('MN-073: 방 입장·판 시작·판 끝(다음 방)·나감에 loc가 맞게 바뀜, game:<id>는 Node 이름', async (t) => {
    const { n2 } = await startTwoNodes(t)
    startSync(t)
    const epoch = cluster.bootEpoch()

    // 방 입장
    playerRoom.set('u1', 'room-1')
    playerRoom.set('u2', 'room-1')
    await settle()
    assert.deepEqual(await readKey(n2, keys().loc('u1')), { node: 'n1', bootEpoch: epoch, kind: 'room', id: 'room-1' })

    // 판 시작: 방 장부에서 빠지고 판 장부에 들어감
    playerRoom.delete('u1'); playerRoom.delete('u2')
    registryWrite.registerGameSession({ id: 'g1', roomId: 'room-1', phase: 'DAY', players: new Map([['u1', {}], ['u2', {}]]) })
    await settle()
    assert.deepEqual(await readKey(n2, keys().loc('u2')), { node: 'n1', bootEpoch: epoch, kind: 'game', id: 'g1' })
    assert.equal(await readKey(n2, keys().game('g1')), 'n1')

    // 판 끝(ENDED) 뒤 u1은 다음 방에 들어가고 결과 화면 닫음 → 방 위치, u2도 닫음 → 판 지워짐
    gameSessions.get('g1').phase = 'ENDED'
    playerRoom.set('u1', 'room-2')
    registryWrite.endGameSessionForPlayer('u1', 'LEFT')
    await settle()
    assert.deepEqual(await readKey(n2, keys().loc('u1')), { node: 'n1', bootEpoch: epoch, kind: 'room', id: 'room-2' })
    registryWrite.endGameSessionForPlayer('u2', 'LEFT')
    await settle()
    assert.equal(await readKey(n2, keys().loc('u2')), null)
    assert.equal(await readKey(n2, keys().game('g1')), null)

    // 방 나감
    playerRoom.delete('u1')
    await settle()
    assert.equal(await readKey(n2, keys().loc('u1')), null)
})

test('MN-073: 진행 중 기권(releasePlayerSession)·판째 지움도 loc 빠짐', async (t) => {
    const { n2 } = await startTwoNodes(t)
    startSync(t)
    registryWrite.registerGameSession({ id: 'g2', roomId: 'room-9', phase: 'NIGHT', players: new Map([['a', {}], ['b', {}]]) })
    await settle()
    assert.equal(registryWrite.releasePlayerSession('a', 'g2'), true)
    await settle()
    assert.equal(await readKey(n2, keys().loc('a')), null)
    assert.equal((await readKey(n2, keys().loc('b'))).kind, 'game')
    registryWrite.endGameSessionForPlayer('b', 'ABORT')
    await settle()
    assert.equal(await readKey(n2, keys().loc('b')), null)
    assert.equal(await readKey(n2, keys().game('g2')), null)
})

test('MN-074: 다른 Node로 옮긴 뒤 옛 Node의 늦은 지우기가 새 값을 안 지움', async (t) => {
    const { n2 } = await startTwoNodes(t)
    startSync(t)
    playerRoom.set('mover', 'room-1')
    await settle()
    // n2가 이 사람 위치를 새로 씀 (n2 방에 들어감)
    const fresh = { node: 'n2', bootEpoch: n2.bootEpoch, kind: 'room', id: 'room-n2' }
    await n2.directory.write(keys().loc('mover'), fresh, { ttlMs: 60000 })
    // n1 쪽 15초 유예가 끝나 늦게 방에서 뺌
    playerRoom.delete('mover')
    await settle()
    assert.deepEqual(await readKey(n2, keys().loc('mover')), fresh)
})

test('단일 모드(REDIS_URL 없음): 장부가 바뀌어도 아무것도 안 씀', async (t) => {
    await cluster.init({ env: {}, log: require('./setup').quietLog })
    t.after(() => cluster.close())
    startSync(t)
    playerRoom.set('solo', 'room-1')
    await settle()
    assert.equal(cluster.isEnabled(), false)
    assert.equal(playerRoom.get('solo'), 'room-1')
    await locationSync.flushNow()
})

test('MN-099: Redis down 동안 바뀐 장부 → up 되면 지금 장부대로 다시 쓰고 남은 옛 값 지움', async (t) => {
    const { hub, n2 } = await startTwoNodes(t)
    startSync(t)
    playerRoom.set('stay', 'room-1')
    playerRoom.set('leave', 'room-1')
    await settle()
    hub.setDown(true)
    playerRoom.delete('leave')
    playerRoom.set('stay', 'room-2')
    playerRoom.set('new', 'room-3')
    await settle()
    hub.setDown(false)
    await waitFor(async () => (await readKey(n2, keys().loc('new')))?.id === 'room-3')
    assert.equal((await readKey(n2, keys().loc('stay'))).id, 'room-2')
    assert.equal(await readKey(n2, keys().loc('leave')), null)
})

test('MN-103: Redis 재시작(빈 데이터) → 하트비트가 알아채고 loc·game 다시 씀', async (t) => {
    const { hub, n2 } = await startTwoNodes(t)
    startSync(t)
    playerRoom.set('r1', 'room-1')
    registryWrite.registerGameSession({ id: 'g3', roomId: 'room-x', phase: 'DAY', players: new Map([['p1', {}]]) })
    await settle()
    hub.flush()
    assert.equal(await readKey(n2, keys().loc('r1')), null)
    await waitFor(async () => (await readKey(n2, keys().game('g3'))) === 'n1')
    assert.equal((await readKey(n2, keys().loc('r1'))).id, 'room-1')
    assert.equal((await readKey(n2, keys().loc('p1'))).kind, 'game')
})
