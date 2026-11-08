// 2026-11-09 게임 진행 소켓 버그 수정 시험: BE-004 사망 방장 추방 · BE-021 판 없는 계정 추방 영수증 · BE-022 사망자 이모티콘
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../../socket/gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const kickReceiptStore = require('../../socket/kickReceiptStore')
const { createFakeSocket, createFakeIo, countingCallback } = require('../helpers/matchmakingFixtures')

const { handleKickGamePlayer, handleGetKickResult, handleSendEmoji } = gameSessionSocketLayer.__testables
const CODES = kickReceiptStore.KICK_ERROR_CODES
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

let seq = 0
const nextRequestId = () => `bf-req-${++seq}`

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

function kickPayload(session, hostUuid, targetUuid, overrides = {}) {
    return {
        requestId: nextRequestId(),
        bootEpoch: BOOT,
        roomId: session.roomId,
        roomInstanceId: session.roomInstanceId,
        requesterMembershipId: session.players.get(hostUuid)?.membershipId ?? 'mem-none',
        targetUuid,
        targetMembershipId: session.players.get(targetUuid)?.membershipId ?? 'mem-none',
        gameId: session.id,
        ...overrides,
    }
}

function call(handler, io, socket, uuid, payload) {
    const { callback, getResponse } = countingCallback()
    handler(io, socket, uuid, payload, callback)
    return getResponse()
}

test('BE-004: 죽은 방장은 산 참가자를 추방할 수 없고 대상은 그대로 산다', () => {
    const { session, uuids, io, sockets, host } = commitSession('deadhost')
    session.players.get(host).alive = false
    const target = uuids[1]
    const res = call(handleKickGamePlayer, io, sockets.get(host), host, kickPayload(session, host, target))
    assert.equal(res.ok, false)
    assert.equal(res.code, CODES.NOT_HOST)
    assert.equal(session.players.get(target).alive, true)
    assert.equal(gameSessionCore.isParticipatingInSession(session, target), true)
})

test('BE-004: 죽은 방장도 죽은 참가자 추방은 그대로 된다 (승부에 영향 없음)', () => {
    const { session, uuids, io, sockets, host } = commitSession('deadhost-dead')
    session.players.get(host).alive = false
    const target = uuids[2]
    session.players.get(target).alive = false
    const res = call(handleKickGamePlayer, io, sockets.get(host), host, kickPayload(session, host, target))
    assert.equal(res.ok, true, JSON.stringify(res))
})

test('BE-021: 판 없는 계정의 추방 요청은 영수증 자리를 차지하지 않는다', () => {
    const { session, io } = commitSession('noreceipt')
    const outsider = 'outsider-1'
    const socket = createFakeSocket(outsider)
    io.sockets.sockets.set(socket.id, socket)
    const payload = kickPayload(session, outsider, `${session.id}-x`, { requesterMembershipId: 'm', targetUuid: 'someone', targetMembershipId: 'm2' })
    const res = call(handleKickGamePlayer, io, socket, outsider, payload)
    assert.equal(res.code, CODES.SESSION_NOT_FOUND)
    // 영수증이 없으니 결과 조회는 UNKNOWN
    const lookup = call(handleGetKickResult, io, socket, outsider, { bootEpoch: BOOT, requestId: payload.requestId })
    assert.equal(lookup.code ?? lookup.status, CODES.UNKNOWN)
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
