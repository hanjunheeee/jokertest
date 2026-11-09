// 공개 방 목록 방송 묶기 시험 (부하 줄이기 2026-11-09, docs/부하시험.md 11번)
// 판 여럿을 한꺼번에 차릴 때 방송이 0.5초에 한 번으로 묶이고, 마지막 상태는 꼭 감
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const view = require('../../socket/matchmaking/room/view')
const { gameRooms } = require('../../socket/matchmaking/core/state')

const makeIo = () => ({ sent: [], emit(event, payload) { this.sent.push({ event, payload }) } })
const room = (id, players) => ({
    id, accessType: 'open', title: id, players: new Map(players.map((p) => [p, {}])),
    settings: { maxPlayers: 5 }, settingsVersion: 1,
})

test('목록 방송: 처음은 바로, 간격 안 여러 번은 간격 끝에 한 번 (그때 목록 = 마지막 상태)', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
    t.after(() => gameRooms.clear())
    const io = makeIo()
    gameRooms.set('r1', room('r1', ['a']))
    view.emitPublicRoomList(io)
    assert.equal(io.sent.length, 1, '처음은 바로')

    for (let i = 0; i < 30; i += 1) {
        gameRooms.set(`x${i}`, room(`x${i}`, ['b']))
        view.emitPublicRoomList(io)
    }
    assert.equal(io.sent.length, 1, '간격 안에선 안 보냄')

    t.mock.timers.tick(view.PUBLIC_ROOM_LIST_MIN_GAP_MS)
    assert.equal(io.sent.length, 2, '간격 끝에 한 번')
    assert.equal(io.sent[1].payload.rooms.length, 31, '마지막 상태(방 31개)')

    t.mock.timers.tick(view.PUBLIC_ROOM_LIST_MIN_GAP_MS * 3)
    assert.equal(io.sent.length, 2, '바뀐 게 없으면 더 안 보냄')
    view.emitPublicRoomList(io)
    assert.equal(io.sent.length, 3, '간격 지난 뒤엔 다시 바로')
})
