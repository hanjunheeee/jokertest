// 2026-11-09 게임 진행 소켓 버그 수정 시험: 게임 중 추방 없앰(BE-004·BE-021 시험은 추방과 같이 지움) · BE-022 사망자 이모티콘
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../../socket/gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const kickReceiptStore = require('../../socket/kickReceiptStore')
const { createFakeSocket, createFakeIo, countingCallback } = require('../helpers/matchmakingFixtures')

const { handleGetKickResult, handleSendEmoji } = gameSessionSocketLayer.__testables
const BOOT = kickReceiptStore.BOOT_EPOCH

function createConventionFollowingRegistry() {
    return new Proxy(new Map(), {
        get(target, prop, receiver) {
            if (prop === 'get') return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
            return Reflect.get(target, prop, receiver)
        },
    })
}

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
    gameSessionSocketLayer.__testables.__setGameResultPersistForTests(async () => {})
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests(async () => {})
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.__testables.__setGameResultPersistForTests()
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests()
})

// 5명 판, 첫 사람이 방장, 낮으로
function commitSession(id) {
    const uuids = Array.from({ length: 5 }, (_, i) => `${id}-u${i}`)
    const players = new Map(uuids.map((uuid) => [uuid, { uuid, nickname: `n-${uuid}`, isReady: true, membershipId: `mem-${uuid}` }]))
    const prepared = gameSessionCore.prepareGameSession(
        { id: `room-${id}`, instanceId: `inst-${id}`, hostUuid: uuids[0], players, settings: { jokerCount: 1 } },
        { randomFn: () => 0, gameIdFn: () => `game-${id}` },
    )
    assert.equal(prepared.ok, true, JSON.stringify(prepared))
    gameSessionCore.commitGameSession(prepared.session)
    gameSessionCore.__testables.enterDayPhase(prepared.session)
    const session = prepared.session
    const io = createFakeIo([])
    const sockets = new Map()
    for (const uuid of uuids) {
        const socket = createFakeSocket(uuid)
        socket.rooms.add(session.channelId)
        socket.data.activeGameId = session.id
        io.sockets.sockets.set(socket.id, socket)
        sockets.set(uuid, socket)
    }
    return { session, uuids, io, sockets, host: uuids[0] }
}

function call(handler, io, socket, uuid, payload) {
    const { callback, getResponse } = countingCallback()
    handler(io, socket, uuid, payload, callback)
    return getResponse()
}

test('게임 중 추방 없앰: kick_game_player는 등록 안 되고 옛 화면이 보내도 아무 일 없음, 결과 조회는 그대로', () => {
    const { session, uuids, io, sockets, host } = commitSession('nokick')
    const socket = sockets.get(host)
    gameSessionSocketLayer.registerGameHandlers(io, socket, host)
    assert.equal(socket.listenerCount('kick_game_player'), 0)
    assert.equal(socket.listenerCount('get_kick_result'), 1)
    assert.equal(gameSessionSocketLayer.__testables.handleKickGamePlayer, undefined)

    // 옛 화면이 보낸 추방 요청: 듣는 곳 없어 판·참가자 그대로
    const { callback, getCalls } = countingCallback()
    socket.trigger('kick_game_player', { gameId: session.id, targetUuid: uuids[1] }, callback)
    assert.equal(getCalls(), 0)
    assert.equal(gameSessionCore.isParticipatingInSession(session, uuids[1]), true)
    assert.equal(io.broadcasts.length, 0)

    // 대기방 추방 화면이 쓰는 결과 조회는 남음 (영수증 없으면 UNKNOWN)
    const lookup = call(handleGetKickResult, io, socket, host, { bootEpoch: BOOT, requestId: 'never-sent' })
    assert.equal(lookup.status, 'UNKNOWN')
})

test('BE-022: 죽은 사람의 이모티콘은 PLAYER_NOT_ALIVE로 거절되고 방송되지 않는다', () => {
    const { session, uuids, io, sockets } = commitSession('deademoji')
    const dead = uuids[3]
    session.players.get(dead).alive = false
    session.emojiPaletteByUuid = new Map([[dead, { owned: ['emo-1'], slots: ['emo-1'] }]])
    session.emojiRateLimit = new Map()
    const res = call(handleSendEmoji, io, sockets.get(dead), dead, { gameId: session.id, itemId: 'emo-1' })
    assert.equal(res.ok, false)
    assert.equal(res.code, 'PLAYER_NOT_ALIVE')
    assert.equal(io.broadcasts.filter((b) => b.event === 'emoji_shown').length, 0)
})

test('known 2장 종료 필드: 결과 내용을 못 만들어도 승부 방송에는 판 id·날짜가 붙는다', () => {
    const { withTerminalFields } = require('../../socket/gameSession/departure/end')
    const { session } = commitSession('terminal-null')
    session.phase = 'ENDED'
    session.winResult = { winner: 'CITIZEN', reason: 'ALL_JOKERS_ELIMINATED' }
    const merged = withTerminalFields(session, { winner: 'CITIZEN' }, null, '[시험]', {})
    assert.equal(merged.gameId, session.id)
    assert.equal(merged.dayIndex, session.dayIndex)
})

test('BE-020: 판 끝 순간 연결 없던 사람은 정리 예약 뒤 끝난 판에서 빠지고, 다 빠지면 판이 장부에서 지워진다', () => {
    const { scheduleEndedSweep } = require('../../socket/gameSession/departure/end')
    const { session, uuids, io, sockets } = commitSession('ended-sweep')
    const [stayer, ...gone] = uuids
    for (const uuid of gone) io.sockets.sockets.delete(sockets.get(uuid).id)
    session.phase = 'ENDED'
    session.winResult = { winner: 'CITIZEN', reason: 'ALL_JOKERS_ELIMINATED' }

    const timers = []
    scheduleEndedSweep(io, session, { setTimeoutFn: (fn) => { timers.push(fn); return timers.length }, delayMs: 0 })
    assert.equal(timers.length, 1)
    timers[0]()

    const bound = new Map(gameSessionCore.__getStateSnapshotForTests().playerSession)
    for (const uuid of gone) assert.equal(bound.has(uuid), false, '연결 없던 사람은 빠짐')
    assert.equal(bound.get(stayer), session.id, '붙어 있는 사람은 결과 화면 그대로')

    // 남은 사람도 끊긴 뒤 다시 정리하면 판째로 지워짐
    io.sockets.sockets.delete(sockets.get(stayer).id)
    scheduleEndedSweep(io, session, { setTimeoutFn: (fn) => { timers.push(fn); return timers.length }, delayMs: 0 })
    timers[1]()
    const after = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(after.gameSessions.some(([id]) => id === session.id), false)
})
