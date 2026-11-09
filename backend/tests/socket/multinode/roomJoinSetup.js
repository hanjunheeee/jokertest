// 조각 4 시험 도우미 파일, 메모리 Redis 위 n1(이 프로세스 matchmaking)·n2를 켜고 가짜 소켓·서비스로 방 흐름을 돌림
// tests/socket/multinode/room*.test.js가 씀 (진짜 DB·Redis 없이 npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const matchmaking = require('../../../socket/matchmaking')
const { cluster, startTwoNodes, waitFor, tick } = require('./setup')
const { createFakeSocket, createFakeIo, validSettingsPayload } = require('../../helpers/matchmakingFixtures')
const roomDirectory = require('../../../socket/matchmaking/cluster/roomDirectory')
const roomListSync = require('../../../socket/matchmaking/cluster/roomListSync')
const { __resetEntryLimitsForTests } = require('../../../socket/matchmaking/join/entryLimits')

// 가짜 서비스 (DB 안 감)
matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: `닉-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
})
matchmaking.__setGameResultRepositoryForTests({ getAccountRecordSummaries: async () => new Map() })
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const BOOT = matchmaking.__getBootEpochForTests()
const { handleCreateRoom, handleJoinRoomByCode, handleJoinPublicRoom, handleDeleteRoom, handleGetPublicRooms } = matchmaking.__testables

// n1·n2 켜고 장부·디렉터리·목록 기록 비움 (n1 bootEpoch = matchmaking BOOT_EPOCH, 운영과 같게)
async function startRoomNodes(t, opts = {}) {
    const reset = () => {
        matchmaking.__resetStateForTests()
        roomDirectory.__resetRoomDirectoryForTests()
        roomListSync.__resetRoomListSyncForTests()
        __resetEntryLimitsForTests()
    }
    reset()
    t.after(reset)
    return startTwoNodes(t, { bootEpoch: BOOT, ...opts })
}

const keys = () => cluster.directory.keys()
// 같은 차례 맞추기·스냅샷 쓰기 끝날 때까지
const settle = async () => { await tick(5); await new Promise((resolve) => setImmediate(resolve)) }

// n2에 방 하나 있는 것처럼 디렉터리 채움 → 값
async function seedRemoteRoom(n2, { roomId = 'room-n2', code = 'NTWOAB', node = 'n2', bootEpoch = n2.bootEpoch, instanceId = `${roomId}-inst` } = {}) {
    const value = { node, bootEpoch, code, instanceId }
    await n2.directory.write(keys().room(roomId), value, { ttlMs: 60000 })
    if (code) await n2.directory.write(keys().roomcode(code), roomId, { ttlMs: 60000 })
    return value
}

// 방 만들기 (가짜 소켓) → { io, host, room }
async function createRoom(uuid, accessType = 'code', io = null) {
    const host = createFakeSocket(uuid)
    const useIo = io ?? createFakeIo([host])
    if (io) io.sockets.sockets.set(host.id, host)
    const answer = await new Promise((resolve) => handleCreateRoom(useIo, host, uuid, validSettingsPayload({ accessType }), resolve))
    return { io: useIo, host, answer }
}

// 소켓이 받은 마지막 입장 실패
const lastJoinFailure = (socket) => socket.emitted.filter((e) => e.event === 'room_join_failed').at(-1)?.payload ?? null

module.exports = {
    matchmaking, cluster, BOOT, keys, settle, waitFor, tick,
    startRoomNodes, seedRemoteRoom, createRoom, lastJoinFailure,
    createFakeSocket, createFakeIo, validSettingsPayload,
    handleCreateRoom, handleJoinRoomByCode, handleJoinPublicRoom, handleDeleteRoom, handleGetPublicRooms,
    roomDirectory, roomListSync,
}
