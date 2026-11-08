// 운영 인원 규칙 시험 (BE-001·BE-017): NODE_ENV=production이면 한 판 5~10명, 개발 값(GAME_DEV_MIN_PLAYERS)은 무시
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../../socket/matchmaking')
matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ nickname: `user-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null,
            profileBorderId: null,
            cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }])),
    getEmojiPalette: async () => ({ slots: Array(8).fill(null), owned: [] }),
})
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (userIds) => new Map(userIds.map((id) => [id, { totalGames: 0, winRate: 0 }])),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })
const gameSession = require('../../game-core/gameSession')
const { handleCreateRoom, handleJoinRoomByCode, handleStartGame, handleSetReady } = matchmaking.__testables
const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    readyPayload,
    startPayload,
} = require('../helpers/matchmakingFixtures')

// 운영 환경 + 개발 최소 인원 값을 일부러 낮게 둠 (운영에선 무시돼야 함)
let originalNodeEnv
let originalDevMin
test.beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
    originalDevMin = process.env.GAME_DEV_MIN_PLAYERS
    process.env.NODE_ENV = 'production'
    process.env.GAME_DEV_MIN_PLAYERS = '1'
    matchmaking.__resetStateForTests()
    gameSession.__resetStateForTests()
})
test.afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalDevMin === undefined) delete process.env.GAME_DEV_MIN_PLAYERS
    else process.env.GAME_DEV_MIN_PLAYERS = originalDevMin
    matchmaking.__resetStateForTests()
    gameSession.__resetStateForTests()
})

// 방장 + 참가자 n명 넣고 전원 준비
async function setupRoom(prefix, maxPlayers, joinerCount) {
    const hostUuid = `${prefix}-host`
    const hostSocket = createFakeSocket(hostUuid)
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload({ maxPlayers, jokerCount: 1 }),
    )
    assert.equal(created.ok, true)
    const sockets = { [hostUuid]: hostSocket }
    for (let i = 1; i <= joinerCount; i += 1) {
        const uuid = `${prefix}-p${i}`
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, created.room.roomCode)
        sockets[uuid] = s
    }
    for (const [uuid, s] of Object.entries(sockets)) {
        await callAsPromise(handleSetReady, io, s, uuid, readyPayload(created.room))
    }
    return { io, hostSocket, hostUuid, room: created.room }
}

test('운영: 정원 4 방 만들기는 거절된다', async () => {
    const hostSocket = createFakeSocket('prod-cap4-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'prod-cap4-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(created.ok, false)
})

test('운영: 정원 5 방에 4명만 모두 준비하면 개발 최소 인원 값과 상관없이 MIN_PLAYERS_NOT_MET', async () => {
    const { io, hostSocket, hostUuid, room } = await setupRoom('prod-4', 5, 3)
    const before = gameSession.__getStateSnapshotForTests()
    const res = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room))
    assert.equal(res.ok, false)
    assert.equal(res.code, 'MIN_PLAYERS_NOT_MET')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), before)
})

test('운영: 정원 5 방에 5명 모두 준비하면 시작된다', async () => {
    const { io, hostSocket, hostUuid, room } = await setupRoom('prod-5', 5, 4)
    const res = await callAsPromise(handleStartGame, io, hostSocket, hostUuid, startPayload(room))
    assert.equal(res.ok, true)
    assert.equal(typeof res.gameId, 'string')
})
