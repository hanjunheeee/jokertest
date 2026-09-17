/**
 * F-20: 대기방 설정 변경(update_room_settings)의 소켓 계약 검증.
 *
 * 실제 handleCreateRoom/handleJoinRoomByCode/handleSetReady/handleStartGame을 그대로 호출해
 * 방을 만들고 입장시킨다 — registry를 손으로 심지 않는다. 대역은 SQL(userRepository·
 * economyService·gameInviteService)과 소켓 전송뿐이며, 권한·버전·점유·경합 판정은 전부
 * 프로덕션 경로 그대로 돈다.
 */

// backend/models는 require 시점에 DATABASE_URL을 **파싱만** 한다(연결은 시도하지 않는다).
// 이 파일만 직접 실행해도 되도록 같은 디렉터리의 다른 스위트와 같은 관례로 더미 폴백을 둔다
// (값은 .env.test와 동일하며, 이미 설정돼 있으면 덮지 않는다).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const matchmaking = require('../matchmaking')
const gameSessionCore = require('../../game-core/gameSession')

matchmaking.__setUserRepositoryForTests({
    findByUuid: async (uuid) => ({ nickname: `user-${uuid}` }),
})

// getGameStartLoadouts는 start_game 경로의 유일한 await 경계다. 저장과 시작이 겹치는 창을
// 결정적으로 재현하려면 그 경계를 원하는 시점까지 붙잡아 둘 수 있어야 한다.
// gate.entered는 "시작 요청이 실제로 그 대기에 들어갔다"를, gate.release()는 재개를 뜻한다.
let startLoadoutGate = null
// "이 시작 요청이 비동기 선행 작업(외형 조회)에 들어가기 전에 거부됐는가"를 관찰하는 값이다.
let startLoadoutCalls = 0

function createStartGate() {
    let release
    let signalEntered
    const entered = new Promise((resolve) => { signalEntered = resolve })
    const blocked = new Promise((resolve) => { release = resolve })
    return { entered, release: () => release(), onEnter: () => { signalEntered(); return blocked } }
}

/**
 * captureRoomStartProfiles가 **내부 검사를 통과한 뒤** loadout을 읽는 바로 그 순간에 부른다.
 *
 * 그 함수는 조회 결과를 기다린 뒤 방장·참가자·준비·설정 버전을 검사하고, **통과한 다음에야**
 * loadouts[uuid]를 읽어 세션 후보를 조립한다(backend/socket/matchmaking.js의 해당 본문).
 * 그래서 이 hook이 실제로 불렸다는 사실 자체가 "내부 검사가 통과했다"는 증거이고, 여기서
 * 건 마이크로태스크는 capture가 반환해 바깥 await가 재개되기 **직전**에 실행된다 —
 * 반려 문서가 지목한 "내부 검사 이후·바깥 재개 이전" 창이 바로 이 구간이다.
 */
let onStartLoadoutsRead = null

matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (userIds) => {
        startLoadoutCalls += 1
        if (startLoadoutGate) await startLoadoutGate.onEnter()
        const base = Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null, profileBorderId: null, cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))
        if (!onStartLoadoutsRead) return base
        const hook = onStartLoadoutsRead
        onStartLoadoutsRead = null
        let fired = false
        return new Proxy(base, {
            get(target, prop, receiver) {
                // **uuid 키를 읽을 때만** 부른다. await가 이 객체를 결과로 확정할 때 `then`을
                // 먼저 읽는데, 그 시점은 아직 내부 검사 **이전**이라 여기서 hook을 부르면
                // 재현하려던 창이 아니라 그 앞 구간을 재현하게 된다(실제로 그렇게 어긋났다).
                if (!fired && typeof prop === 'string' && Object.hasOwn(target, prop)) {
                    fired = true
                    hook()
                }
                return Reflect.get(target, prop, receiver)
            },
        })
    },
})
matchmaking.__setGameInviteServiceForTests({
    cancelPendingInvitesForRoom: async () => {},
})

const {
    createFakeSocket,
    createFakeIo,
    callAsPromise,
    validSettingsPayload,
    // F-20(AC-04): set_ready/start_game은 roomId·expectedSettingsVersion을 필수로 요구한다.
    readyPayload,
    startPayload,
} = require('./testHelpers/matchmakingFixtures')

const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleGetPublicRooms,
    handleSetReady,
    handleStartGame,
    handleUpdateRoomSettings,
    handleGetRoomSettingsUpdateResult,
} = matchmaking.__testables

const { ROOM_SETTINGS_ERROR_CODES, ROOM_SETTINGS_EVENTS } = matchmaking
// 식별자 상한은 저장·조회가 공유하는 계약이다 — 시험이 사본 상수를 만들면 그 공유가 깨져도 모른다.
const { MAX_IDENTIFIER_LENGTH } = require('../../utils/updateRoomSettingsValidation')

/** 현재 서버가 들고 있는 방 상태의 **깊은** 복사본. 같은 참조 비교로 무변경을 오판하지 않는다. */
function snapshotRooms() {
    return JSON.stringify(matchmaking.__getStateSnapshotForTests().gameRooms)
}

/** 유효한 update_room_settings payload 하나를 만든다(기본은 생성 시 설정과 같은 값). */
function updatePayload(roomId, overrides = {}) {
    return {
        roomId,
        requestId: `req-${Math.random().toString(36).slice(2)}`,
        expectedSettingsVersion: 1,
        accessType: 'open',
        maxPlayers: 8,
        jokerCount: 2,
        roleCompositionMode: 'auto',
        dayDiscussionTime: 60,
        dayVoteTime: 60,
        nightActionTime: 90,
        ...overrides,
    }
}

/** host 1명으로 방 하나를 실제로 만든다. */
async function createRoom(io, hostUuid, payloadOverrides = {}) {
    const hostSocket = createFakeSocket(hostUuid)
    io.sockets.sockets.set(hostSocket.id, hostSocket)
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, hostUuid, validSettingsPayload(payloadOverrides),
    )
    assert.equal(created.ok, true, created.message)
    return { hostSocket, room: created.room }
}

/** 실제 코드 참가 경로로 참가자 한 명을 더 넣는다. */
async function joinRoom(io, roomCode, uuid) {
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)
    await handleJoinRoomByCode(io, socket, uuid, roomCode)
    return socket
}

test.beforeEach(() => {
    startLoadoutGate = null
    startLoadoutCalls = 0
    onStartLoadoutsRead = null
    matchmaking.__resetStateForTests()
    // game-core는 별도 registry(gameSessions/playerSession/roomGameSession)를 갖는다 —
    // matchmaking 초기화로는 비워지지 않아 여기서 따로 비운다(matchmaking.test.js와 같은 관례).
    gameSessionCore.__resetStateForTests()
})

// ── AC-01: 권한·상태 게이트 ─────────────────────────────────────────────────

test('AC-01 · 방장이 아닌 참가자·외부인·다른 방 ID·미확정 입장·교체된 소켓의 저장은 모두 거부되고 상태가 변하지 않는다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoom(io, 'host-a')
    const joinerSocket = await joinRoom(io, room.roomCode, 'player-p')
    const outsiderSocket = createFakeSocket('outsider-x')
    io.sockets.sockets.set(outsiderSocket.id, outsiderSocket)

    // 별도의 다른 방 B — 방장 H가 그 방 ID로 저장을 시도해도 안 된다.
    const otherIo = createFakeIo([])
    const { room: roomB } = await createRoom(otherIo, 'host-b')

    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    const cases = [
        // 참가자(방장 아님)
        { socket: joinerSocket, uuid: 'player-p', payload: updatePayload(room.roomId), code: ROOM_SETTINGS_ERROR_CODES.NOT_HOST },
        // 방에 없는 외부인
        { socket: outsiderSocket, uuid: 'outsider-x', payload: updatePayload(room.roomId), code: ROOM_SETTINGS_ERROR_CODES.NOT_IN_ROOM },
        // 방장이지만 자기 방이 아닌 방 ID
        { socket: io.sockets.sockets.get('sock-host-a'), uuid: 'host-a', payload: updatePayload(roomB.roomId), code: ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND },
        // 존재하지 않는 방 ID
        { socket: io.sockets.sockets.get('sock-host-a'), uuid: 'host-a', payload: updatePayload('no-such-room'), code: ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND },
    ]

    for (const { socket, uuid, payload, code } of cases) {
        const res = await callAsPromise(handleUpdateRoomSettings, io, socket, uuid, payload)
        assert.equal(res.ok, false, `${uuid}/${code} 요청이 거부되지 않았다`)
        assert.equal(res.code, code)
    }

    // 위조된 hostUuid를 payload에 실어도 신원으로 쓰이지 않는다(허용 목록 밖 키라 형태에서 거부).
    const forged = await callAsPromise(
        handleUpdateRoomSettings, io, joinerSocket, 'player-p',
        { ...updatePayload(room.roomId), hostUuid: 'player-p' },
    )
    assert.equal(forged.ok, false)
    assert.equal(forged.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)

    assert.equal(snapshotRooms(), before, '거부된 요청이 방 상태를 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsBefore, '거부된 요청이 방송을 발생시켰다')
})

test('AC-01 · 계정의 canonical 소켓이 교체된 뒤 도착한 옛 소켓의 저장은 STALE_SOCKET으로 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a')

    // 같은 계정의 새 로그인이 canonical 소켓을 교체한 상태를 접근자로 표현한다.
    const getCurrentSocketId = () => 'sock-host-a-NEW'

    const before = snapshotRooms()
    const res = await new Promise((resolve) => handleUpdateRoomSettings(
        io, hostSocket, 'host-a', updatePayload(room.roomId, { maxPlayers: 6 }), resolve, getCurrentSocketId,
    ))
    assert.equal(res.ok, false)
    assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(snapshotRooms(), before)

    // 연결이 끊긴 소켓도 같은 이유로 거부된다.
    hostSocket.connected = false
    const disconnected = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, { maxPlayers: 6 }),
    )
    assert.equal(disconnected.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(snapshotRooms(), before)
})

test('AC-01 · 이미 성공한 요청의 재전달도 현재 연결을 먼저 인증하고, 유효한 연결의 멱등 재시도만 결과를 돌려준다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const requestId = 'req-replay-auth'
    const payload = updatePayload(room.roomId, { requestId, maxPlayers: 6 })
    const first = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', payload)
    assert.equal(first.ok, true, first.message)
    assert.equal(first.settingsVersion, 2)

    const afterCommit = snapshotRooms()
    const broadcastsAfterCommit = io.broadcasts.length

    // (a) 연결이 끊긴 소켓의 재전달 — 기록이 있어도 ok:true를 돌려주면 안 된다.
    hostSocket.connected = false
    const disconnectedReplay = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', { ...payload },
    )
    assert.equal(disconnectedReplay.ok, false, '끊긴 소켓의 재전달이 성공 결과를 받았다')
    assert.equal(disconnectedReplay.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(disconnectedReplay.settingsVersion, undefined, '거부 응답이 저장 결과를 흘렸다')

    // (b) canonical 소켓이 교체된 뒤의 재전달도 같은 이유로 거부된다.
    hostSocket.connected = true
    const replacedReplay = await new Promise((resolve) => handleUpdateRoomSettings(
        io, hostSocket, 'host-a', { ...payload }, resolve, () => 'sock-host-a-NEW',
    ))
    assert.equal(replacedReplay.ok, false, '교체된 소켓의 재전달이 성공 결과를 받았다')
    assert.equal(replacedReplay.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)

    // (c) 유효한 현재 연결의 같은 요청 재전달은 그대로 살아 있다(재커밋 없이 기록된 결과).
    const validReplay = await new Promise((resolve) => handleUpdateRoomSettings(
        io, hostSocket, 'host-a', { ...payload }, resolve, () => hostSocket.id,
    ))
    assert.equal(validReplay.ok, true, validReplay.message)
    assert.equal(validReplay.replayed, true)
    assert.equal(validReplay.settingsVersion, 2, '재전달이 버전을 다시 올렸다')

    // (d) 같은 키의 다른 입력은 여전히 키 재사용으로 거부된다.
    const reused = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', { ...payload, maxPlayers: 10 },
    )
    assert.equal(reused.code, ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED)

    // 어느 재전달도 재커밋·재방송·준비 재해제를 만들지 않았다.
    assert.equal(snapshotRooms(), afterCommit, '재전달이 방 상태를 다시 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsAfterCommit, '재전달이 방송을 다시 발생시켰다')
})

test('AC-01 · 결과 조회도 끊기거나 교체된 소켓에서는 기록을 읽지 못한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const requestId = 'req-lookup-auth'
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))

    const lookupArgs = { roomId: room.roomId, requestId }

    hostSocket.connected = false
    const disconnected = await new Promise((resolve) =>
        handleGetRoomSettingsUpdateResult('host-a', lookupArgs, resolve, hostSocket))
    assert.equal(disconnected.ok, false)
    assert.equal(disconnected.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(disconnected.status, undefined, '거부 응답이 적용 여부를 흘렸다')

    hostSocket.connected = true
    const replaced = await new Promise((resolve) =>
        handleGetRoomSettingsUpdateResult('host-a', lookupArgs, resolve, hostSocket, () => 'sock-host-a-NEW'))
    assert.equal(replaced.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)

    const live = await new Promise((resolve) =>
        handleGetRoomSettingsUpdateResult('host-a', lookupArgs, resolve, hostSocket, () => hostSocket.id))
    assert.equal(live.status, 'APPLIED')
    assert.equal(live.settingsVersion, 2)
})

test('AC-01 · 미확정 입장(예약) 상태의 요청자는 설정을 저장할 수 없다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a')
    matchmaking.__seedAdmissionAttemptForTests('host-a', { roomId: room.roomId, phase: 'reserved' })

    const before = snapshotRooms()
    const res = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, { maxPlayers: 6 }),
    )
    assert.equal(res.ok, false)
    assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.ADMISSION_PENDING)
    assert.equal(snapshotRooms(), before)
})

// ── AC-02: 정원 하한 ────────────────────────────────────────────────────────

test('AC-02 · 현재 참가 인원보다 작은 정원은 거부되고, 인원 이상이면 저장된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 1 })
    await joinRoom(io, room.roomCode, 'p1')
    await joinRoom(io, room.roomCode, 'p2')
    await joinRoom(io, room.roomCode, 'p3')
    await joinRoom(io, room.roomCode, 'p4') // host 포함 5명

    const before = snapshotRooms()
    const tooSmall = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(tooSmall.ok, false)
    assert.equal(tooSmall.code, ROOM_SETTINGS_ERROR_CODES.MAX_PLAYERS_BELOW_OCCUPANCY)
    assert.equal(tooSmall.occupancy, 5)
    assert.equal(snapshotRooms(), before, '거부된 축소가 저장을 바꿨다')

    const exact = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 5, jokerCount: 1 }),
    )
    assert.equal(exact.ok, true, exact.message)
    assert.equal(exact.changed, true)
    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(stored.settings.maxPlayers, 5)
})

test('AC-02 · 유효한 reserved 예약도 점유로 세고, 예약이 만료되면 같은 축소가 허용된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 1 })
    await joinRoom(io, room.roomCode, 'p1')
    await joinRoom(io, room.roomCode, 'p2')
    await joinRoom(io, room.roomCode, 'p3') // 확정 4명
    matchmaking.__seedAdmissionAttemptForTests('invited-1', { roomId: room.roomId, phase: 'reserved' })

    const blocked = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(blocked.code, ROOM_SETTINGS_ERROR_CODES.MAX_PLAYERS_BELOW_OCCUPANCY)
    assert.equal(blocked.occupancy, 5, '확정 4명 + 예약 1명이 5로 세어져야 한다')

    // 예약이 기한을 넘기면 더 이상 자리를 차지하지 않는다.
    matchmaking.__expireAdmissionAttemptForTests('invited-1')
    const allowed = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(allowed.ok, true, allowed.message)
})

test('AC-02 · published 입장은 room.players와 예약에서 중복으로 세지 않는다', async () => {
    const io = createFakeIo([])
    // **정원과 꼭 같은 인원**으로 만든다. 여유가 한 자리라도 있으면 published를 두 번 세는
    // 구현도 이 시험을 통과한다 — 자리가 정확히 다 찼을 때만 중복 계산이 거부로 드러난다.
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    await joinRoom(io, room.roomCode, 'p1')
    await joinRoom(io, room.roomCode, 'p2')
    await joinRoom(io, room.roomCode, 'p3') // host 포함 확정 4명 = 정원 4
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms[0][1].players.length, 4)
    // 확정 명단에 **이미 있는** 계정의 published 시도 — 자리를 한 번만 차지해야 한다.
    matchmaking.__seedAdmissionAttemptForTests('p3', { roomId: room.roomId, phase: 'published' })

    const res = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(res.ok, true, `published가 중복 계산됐다: ${JSON.stringify(res)}`)
    assert.equal(res.occupancy, undefined)
})

// ── AC-03: 편집 결과가 참가자·방 목록에 반영된다 ────────────────────────────

test('AC-03 · 입장 방식·정원·역할 구성·직업별 밤 시간을 저장하면 참가자 응답과 공개 목록에 즉시 반영된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, {
        accessType: 'code',
        maxPlayers: 6,
        jokerCount: 1,
        roleCompositionMode: 'custom',
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
        dayDiscussionTime: 90,
        dayVoteTime: 30,
        nightActionTime: 60,
        roleNightActionTimes: { JOKER: 30, GUARD: 120 },
    }))
    assert.equal(res.ok, true, res.message)
    assert.equal(res.changed, true)
    assert.equal(res.settingsVersion, 2)

    // 참가자 응답(get_current_room)
    const current = await callAsPromise(handleGetCurrentRoom, 'p1')
    assert.equal(current.room.accessType, 'code')
    assert.equal(current.room.settingsVersion, 2)
    assert.deepEqual(current.room.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
    assert.deepEqual(current.room.settings.roleNightActionTimes, { JOKER: 30, GUARD: 120 })
    assert.equal(current.room.settings.dayDiscussionTime, 90)
    assert.equal(current.room.settings.dayVoteTime, 30)
    assert.equal(current.room.settings.nightActionTime, 60)
    assert.equal(current.room.settings.maxPlayers, 6)

    // 다른 참가자에게 변경 사건이 실제로 전달됐다(채널 방송이 아니라 개별 전달이다).
    const delivered = joinerSocket.emitted.filter((e) => e.event === ROOM_SETTINGS_EVENTS.ROOM_SETTINGS_UPDATED)
    assert.equal(delivered.length, 1)
    assert.equal(delivered[0].payload.settingsVersion, 2)
    assert.equal(delivered[0].payload.accessType, 'code')
    assert.equal(delivered[0].payload.canStart, false)

    // 공개 목록 — code 방도 계속 보이고, 요약에 승인된 설정만 담긴다.
    const list = await callAsPromise(handleGetPublicRooms)
    const listed = list.rooms.find((r) => r.id === room.roomId)
    assert.equal(listed.accessType, 'code')
    assert.equal(listed.max, 6)
    assert.equal(listed.settingsVersion, 2)
    assert.equal(listed.settings.dayDiscussionTime, 90)
    assert.deepEqual(listed.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
})

test('AC-03 · 공개 목록 요약에는 코드·신원·준비 상태·보존 플래그가 들어가지 않는다', async () => {
    const io = createFakeIo([])
    const { room } = await createRoom(io, 'host-a', { accessType: 'code' })
    await joinRoom(io, room.roomCode, 'p1')

    const list = await callAsPromise(handleGetPublicRooms)
    const listed = list.rooms.find((r) => r.id === room.roomId)
    const serialized = JSON.stringify(listed)

    for (const forbidden of ['roomCode', 'hostUuid', 'players', 'isReady', 'code']) {
        assert.equal(Object.hasOwn(listed, forbidden), false, `${forbidden}가 공개 목록에 노출됐다`)
    }
    assert.equal(serialized.includes(room.roomCode), false, '실제 입장 코드가 목록에 새어 나갔다')
    for (const preserved of ['lightsOut', 'soulBetting', 'voteReveal']) {
        assert.equal(Object.hasOwn(listed.settings, preserved), false, `${preserved}는 목록 요약 대상이 아니다`)
    }
})

test('AC-03 · custom→auto 전환은 저장에서 roleCounts를 제거한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', {
        maxPlayers: 8, jokerCount: 1, roleCompositionMode: 'custom',
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    })

    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, {
        maxPlayers: 8, jokerCount: 2, roleCompositionMode: 'auto',
    }))
    assert.equal(res.ok, true, res.message)

    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(Object.hasOwn(stored.settings, 'roleCounts'), false)
    assert.equal(stored.settings.roleCompositionMode, 'auto')

    const current = await callAsPromise(handleGetCurrentRoom, 'host-a')
    assert.equal(Object.hasOwn(current.room.settings, 'roleCounts'), false)
})

test('AC-03 · 잘못된 값(특수직업 3명·역할 합 초과·광대 불일치·비정수 시간·알 수 없는 키)은 저장·방송 없이 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    const invalidPayloads = [
        // 특수직업 3명(형태 검증은 통과하지만 역할 계약이 2명 상한을 집행한다)
        { roleCompositionMode: 'custom', jokerCount: 1, roleCounts: { JOKER: 1, DOCTOR: 3, GUARD: 0, WITCH_HUNTER: 0 } },
        // 고정 역할 합 > 정원
        { maxPlayers: 4, roleCompositionMode: 'custom', jokerCount: 2, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } },
        // jokerCount와 roleCounts.JOKER 불일치
        { roleCompositionMode: 'custom', jokerCount: 2, roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
        // AUTO인데 roleCounts를 함께 보냄
        { roleCompositionMode: 'auto', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
        // 비정수·문자열 시간
        { dayDiscussionTime: 45 },
        { dayVoteTime: '60' },
        { nightActionTime: 90.5 },
        // 알 수 없는 역할/시간 키
        { roleNightActionTimes: { CITIZEN: 60 } },
        { roleCompositionMode: 'custom', jokerCount: 1, roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 3 } },
        // 서버 소유 필드를 클라이언트가 지정하려는 시도
        { settingsVersion: 9 },
        { hostUuid: 'host-a' },
        { lightsOut: true },
    ]

    for (const overrides of invalidPayloads) {
        const res = await callAsPromise(
            handleUpdateRoomSettings, io, hostSocket, 'host-a', updatePayload(room.roomId, overrides),
        )
        assert.equal(res.ok, false, `거부되지 않은 입력: ${JSON.stringify(overrides)}`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }

    assert.equal(snapshotRooms(), before)
    assert.equal(io.broadcasts.length, broadcastsBefore)
})

// ── AC-04: 준비 해제 정책과 저장/시작 경합 ──────────────────────────────────

test('AC-04 · 실제 설정 변경은 방장 포함 전원의 준비를 해제하고, 같은 설정 재저장은 다시 해제하지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const readyBefore = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].players
    assert.ok(readyBefore.every(([, p]) => p.isReady === true))
    const revisionsBefore = Object.fromEntries(readyBefore.map(([u, p]) => [u, p.readyRevision]))

    const changed = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }),
    )
    assert.equal(changed.ok, true, changed.message)
    assert.equal(changed.settingsVersion, 2)

    const afterChange = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(afterChange.players.every(([, p]) => p.isReady === false), '전원 준비가 해제되지 않았다')
    for (const [u, p] of afterChange.players) {
        assert.equal(p.readyRevision, revisionsBefore[u] + 1, `${u}의 readyRevision이 정확히 1 증가하지 않았다`)
    }

    // 값이 그대로인 새 요청: 버전·준비·방송 무변경, changed=false.
    //
    // 여기서 **다시 전원 준비를 시킨 뒤** 저장한다. 전원이 이미 미준비인 상태에서 저장하면
    // "해제했는데 아무도 바뀌지 않았다"와 "해제 자체를 하지 않았다"가 구별되지 않는다 —
    // 되돌아갈 준비 상태가 실제로 있어야 무변경 단언이 판별력을 갖는다.
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room, true, { settingsVersion: 2 }))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, true, { settingsVersion: 2 }))
    const reReady = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].players
    assert.ok(reReady.every(([, p]) => p.isReady === true), '재준비가 반영되지 않았다')
    const revisionsAfterReReady = Object.fromEntries(reReady.map(([u, p]) => [u, p.readyRevision]))

    const broadcastsBefore = io.broadcasts.length
    const roomsBeforeNoop = snapshotRooms()
    const noop = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1, expectedSettingsVersion: 2 }),
    )
    assert.equal(noop.ok, true)
    assert.equal(noop.changed, false)
    assert.equal(noop.settingsVersion, 2)
    assert.equal(io.broadcasts.length, broadcastsBefore, '변경이 없는데 목록 방송이 나갔다')
    assert.equal(snapshotRooms(), roomsBeforeNoop, '변경이 없는 저장이 방 상태를 바꿨다')

    const afterNoop = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(afterNoop.settingsVersion, 2, '변경이 없는데 버전이 올라갔다')
    for (const [u, p] of afterNoop.players) {
        assert.equal(p.isReady, true, `${u}의 준비가 변경 없는 저장으로 해제됐다`)
        assert.equal(p.readyRevision, revisionsAfterReReady[u], `${u}의 readyRevision이 다시 올라갔다`)
    }
})

test('AC-04 · 같은 requestId 재전달은 재커밋 없이 기록된 결과를 돌려주고, 같은 키의 다른 입력은 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const payload = updatePayload(room.roomId, { maxPlayers: 6 })
    const first = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', payload)
    assert.equal(first.ok, true, first.message)
    assert.equal(first.settingsVersion, 2)

    const afterFirst = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    // 같은 키 + 같은 입력: 기대 버전이 이미 지난 1이어도 기록이 우선이라 재커밋하지 않는다.
    const retry = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', { ...payload })
    assert.equal(retry.ok, true)
    assert.equal(retry.replayed, true)
    assert.equal(retry.changed, true)
    assert.equal(retry.settingsVersion, 2, '재시도가 버전을 다시 올렸다')
    assert.equal(snapshotRooms(), afterFirst)
    assert.equal(io.broadcasts.length, broadcastsBefore)

    // 같은 키 + 다른 입력: 어느 저장을 말하는지 알 수 없으므로 거부한다.
    const reused = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a', { ...payload, maxPlayers: 10 },
    )
    assert.equal(reused.ok, false)
    assert.equal(reused.code, ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED)
    assert.equal(snapshotRooms(), afterFirst)
})

test('AC-04 · 같은 requestId를 다른 기대 버전으로 다시 보내면 같은 요청이 아니므로 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const requestId = 'req-version-reuse'
    const first = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))
    assert.equal(first.ok, true, first.message)
    assert.equal(first.settingsVersion, 2)

    const afterFirst = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length

    // expectedSettingsVersion은 "내가 무엇을 보고 눌렀는가"라는 요청의 일부다. 설정 값이
    // 같아도 근거로 삼은 버전이 다르면 같은 요청이 아니므로, v1의 결과를 v2 요청의 답으로
    // 돌려줘서는 안 된다.
    const differentVersion = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6, expectedSettingsVersion: 2 }))
    assert.equal(differentVersion.ok, false, '기대 버전이 다른 재전달이 멱등 재시도로 처리됐다')
    assert.equal(differentVersion.code, ROOM_SETTINGS_ERROR_CODES.REQUEST_ID_REUSED)
    assert.equal(differentVersion.settingsVersion, undefined)

    // 진짜 재시도(같은 버전·같은 값)는 그대로 멱등이다.
    const trueRetry = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))
    assert.equal(trueRetry.ok, true, trueRetry.message)
    assert.equal(trueRetry.replayed, true)
    assert.equal(trueRetry.settingsVersion, 2)

    assert.equal(snapshotRooms(), afterFirst, '재전달이 방 상태를 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsBefore, '재전달이 방송을 다시 냈다')
})

test('AC-05 · 결과 기록은 삽입 시점에도 상한을 지키고, 가장 오래된 기록부터 버린다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const results = () => matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults
    const MAX = 500

    // 상한까지 실제 핸들러로 채운다(전부 값이 같은 요청이라 버전은 1에 머문다 — 기록만 쌓인다).
    for (let i = 0; i < MAX; i += 1) {
        const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
            updatePayload(room.roomId, { requestId: `cap-${i}` }))
        assert.equal(res.ok, true, res.message)
    }
    assert.equal(results().length, MAX)
    const oldestKeyBefore = results()[0][0]

    // 한 건 더. 진입 시점에만 걷어내면 여기서 size가 상한을 넘은 채 남는다.
    const overflow = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId: 'cap-overflow' }))
    assert.equal(overflow.ok, true, overflow.message)
    assert.equal(results().length, MAX, '삽입 시점에 상한이 집행되지 않았다')

    // 버려진 것은 가장 오래된 기록이고, 방금 넣은 기록은 남아 있어야 한다.
    const keysAfter = results().map(([key]) => key)
    assert.equal(keysAfter.includes(oldestKeyBefore), false, '가장 오래된 기록이 남았다')
    const lookupNew = await callAsPromise(handleGetRoomSettingsUpdateResult, 'host-a',
        { roomId: room.roomId, requestId: 'cap-overflow' })
    assert.notEqual(lookupNew.status, 'UNKNOWN', '방금 넣은 기록이 대신 버려졌다')
    const lookupOld = await callAsPromise(handleGetRoomSettingsUpdateResult, 'host-a',
        { roomId: room.roomId, requestId: 'cap-0' })
    assert.equal(lookupOld.status, 'UNKNOWN')
})

test('AC-05 · 미확정 입장 되돌림으로 방이 비어 사라져도 그 방의 결과 기록은 함께 사라진다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const guestSocket = await joinRoom(io, room.roomCode, 'guest')

    const requestId = 'req-unpublish-room-gone'
    const saved = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))
    assert.equal(saved.ok, true, saved.message)
    assert.equal(matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 1)

    // guest는 아직 영수증이 확정되지 않은 미확정 소속(published)이다.
    matchmaking.__seedAdmissionAttemptForTests('guest', {
        roomId: room.roomId, phase: 'published', socketId: guestSocket.id,
    })
    // 방장이 먼저 떠난다 — 방은 아직 비어 있지 않으므로 이 경로는 기록을 지우지 않는다.
    matchmaking.__testables.removeFromRoom(io, hostSocket, 'host-a')
    assert.equal(
        matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 1,
        '방이 아직 살아 있는데 기록이 사라졌다',
    )

    // guest의 연결이 끊기면 미확정 소속이 동기적으로 되돌아가고, 방은 그 순간 비어 사라진다.
    matchmaking.onDisconnect(io, guestSocket, 'guest')
    assert.equal(
        matchmaking.__getStateSnapshotForTests().gameRooms.length, 0,
        '미확정 소속 되돌림이 빈 방을 정리하지 않았다(전제가 깨졌다)',
    )
    assert.equal(
        matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 0,
        '방이 사라졌는데 그 방의 결과 기록이 남았다',
    )

    const lookup = await callAsPromise(handleGetRoomSettingsUpdateResult, 'host-a',
        { roomId: room.roomId, requestId })
    assert.equal(lookup.status, 'UNKNOWN')
    assert.equal(lookup.room, null)
})

test('AC-04 · 같은 버전으로 들어온 두 저장은 하나만 성공하고 나머지는 충돌이다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const first = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { expectedSettingsVersion: 1, maxPlayers: 6 }),
    )
    const second = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { expectedSettingsVersion: 1, maxPlayers: 10 }),
    )

    assert.equal(first.ok, true)
    assert.equal(second.ok, false)
    assert.equal(second.code, ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT)
    // 충돌 응답은 최신 방 상태를 함께 준다 — 클라이언트가 곧바로 최신값으로 되돌아갈 수 있게.
    assert.equal(second.room.settingsVersion, 2)
    assert.equal(second.room.settings.maxPlayers, 6)
})

test('AC-04 · 값이 우연히 현재와 같더라도 기대 버전이 틀리면 충돌로 처리한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { expectedSettingsVersion: 1, maxPlayers: 6 }))

    const stale = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { expectedSettingsVersion: 1, maxPlayers: 6 }))
    assert.equal(stale.ok, false)
    assert.equal(stale.code, ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT)
})

test('AC-04 · 시작 요청이 외형 조회 중일 때 설정이 저장되면 그 시작은 실패하고 게임이 만들어지지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    // 외형 조회를 붙잡아 둔다 — 이 구간이 곧 저장과 시작이 겹치는 창이다.
    startLoadoutGate = createStartGate()

    const startPromise = new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    await startLoadoutGate.entered // 시작 요청이 실제로 조회 대기에 들어갔음을 보장한다

    const saved = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }),
    )
    assert.equal(saved.ok, true, saved.message)
    assert.equal(saved.settingsVersion, 2)

    const afterSave = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(afterSave.players.every(([, p]) => p.isReady === false), '저장이 준비를 해제하지 않았다')

    // 전원이 다시 준비해도 옛 시작 요청은 v1을 근거로 한 것이라 살아나지 않아야 한다.
    // (다시 준비할 때는 실제 클라이언트처럼 새 버전 v2를 들고 온다.)
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room, true, { settingsVersion: 2 }))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, true, { settingsVersion: 2 }))

    startLoadoutGate.release()
    const startResult = await startPromise
    assert.equal(startResult.ok, false, '옛 설정으로 시작된 요청이 성공했다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null, '게임 세션이 만들어졌다')
    assert.ok(gameRoomStillExists(room.roomId), '실패한 시작이 방을 없앴다')

    // 새 시작 요청은 v2 하나의 설정으로만 성공한다.
    startLoadoutGate = null
    const restarted = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room, { settingsVersion: 2 }), resolve))
    assert.equal(restarted.ok, true, restarted.message)
})

function gameRoomStillExists(roomId) {
    return matchmaking.__getStateSnapshotForTests().gameRooms.some(([id]) => id === roomId)
}

test('AC-04 · 외형 조회 중 참가자가 나갔다가 같은 방에 다시 들어와 준비해도 옛 시작은 실패한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    startLoadoutGate = createStartGate()
    const startPromise = new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    await startLoadoutGate.entered

    // 참가자가 실제로 나갔다가 **같은 방**에 다시 들어와 다시 준비한다. uuid 집합·인원·
    // 준비 상태·설정 버전은 전부 조회 시작 시점과 같아진다 — 그 값들만 보면 구별할 수 없다.
    matchmaking.__testables.removeFromRoom(io, joinerSocket, 'p1')
    const rejoined = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, rejoined, 'p1', readyPayload(room))
    const beforeRelease = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.deepEqual(beforeRelease.players.map(([u]) => u).sort(), ['host-a', 'p1'])
    assert.ok(beforeRelease.players.every(([, p]) => p.isReady === true))
    assert.equal(beforeRelease.settingsVersion ?? 1, 1, '이 사건은 설정 변경 없이 성립해야 한다')

    startLoadoutGate.release()
    const startResult = await startPromise
    assert.equal(startResult.ok, false, '이탈·재입장 사이에 걸쳐 있던 옛 시작이 커밋됐다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.ok(gameRoomStillExists(room.roomId), '실패한 시작이 방을 없앴다')

    // 새 시작 요청은 지금의 참가자 구성으로 정상적으로 성공한다(모든 시작을 막은 것이 아니다).
    startLoadoutGate = null
    const restarted = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(restarted.ok, true, restarted.message)
})

test('AC-04 · 외형 조회 중 canonical 소켓이 교체되면 옛 소켓이 연결돼 있어도 시작이 커밋되지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    // 실제 이벤트 등록부를 거친다 — 등록부가 접근자를 흘려버리면 이 사건은 재현되지 않는다.
    let canonicalHostSocketId = hostSocket.id
    matchmaking.registerMatchmakingHandlers(io, hostSocket, 'host-a', {
        getCurrentSocketId: (u) => (u === 'host-a' ? canonicalHostSocketId : `sock-${u}`),
    })

    startLoadoutGate = createStartGate()
    const startPromise = new Promise((resolve) =>
        hostSocket.trigger('start_game', startPayload(room), resolve))
    await startLoadoutGate.entered

    // 같은 계정의 새 로그인이 canonical 소켓을 가져간다. 옛 소켓은 아직 connected===true다 —
    // 연결 여부만 보는 검사로는 이 상황이 걸러지지 않는다.
    const replacement = createFakeSocket('host-a', { id: 'sock-host-a-2' })
    io.sockets.sockets.set(replacement.id, replacement)
    await replacement.join(room.roomId)
    canonicalHostSocketId = replacement.id
    assert.equal(hostSocket.connected, true, '이 사건의 전제는 옛 소켓이 아직 연결돼 있다는 것이다')

    startLoadoutGate.release()
    const startResult = await startPromise
    assert.equal(startResult.ok, false, '교체된 옛 소켓의 시작이 커밋됐다')
    assert.equal(startResult.code, ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET)
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)
    assert.ok(gameRoomStillExists(room.roomId))

    // 현재 연결이 보낸 시작은 정상적으로 성공한다.
    startLoadoutGate = null
    const byCurrent = await new Promise((resolve) =>
        handleStartGame(io, replacement, 'host-a', startPayload(room), resolve,
            (u) => (u === 'host-a' ? canonicalHostSocketId : `sock-${u}`)))
    assert.equal(byCurrent.ok, true, byCurrent.message)
})

test('AC-04 · 내부 검사 통과 뒤·바깥 재개 전에 준비가 취소되면 그 시작은 커밋되지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    // 설정 버전은 **바뀌지 않는다** — 그 값만 다시 보는 검사로는 이 사건이 걸러지지 않는다.
    let innerCheckPassed = false
    let cancelAck = null
    onStartLoadoutsRead = () => {
        innerCheckPassed = true
        Promise.resolve().then(() => {
            handleSetReady(io, joinerSocket, 'p1', readyPayload(room, false), (res) => { cancelAck = res })
        })
    }

    const startResult = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))

    assert.equal(innerCheckPassed, true,
        '내부 검사가 통과하기 전에 준비가 취소됐다 — 재현하려던 창이 아니다')
    assert.equal(cancelAck?.ok, true, '준비 취소 자체가 성립하지 않았다(전제가 깨졌다)')

    assert.equal(startResult.ok, false, '준비가 취소된 뒤에도 시작이 커밋됐다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null, '게임 세션이 만들어졌다')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('p1'), null)
    assert.ok(gameRoomStillExists(room.roomId), '실패한 시작이 방을 없앴다')

    const afterFailure = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.equal(afterFailure.settingsVersion ?? 1, 1, '이 사건은 설정 버전 변화 없이 성립해야 한다')
    assert.equal(afterFailure.players.find(([u]) => u === 'p1')[1].isReady, false,
        '실패한 시작이 취소된 준비를 되돌렸다')

    // 다시 준비하고 보낸 새 시작 요청은 정상적으로 성공한다(모든 시작을 막아서 푼 것이 아니다).
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))
    const restarted = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(restarted.ok, true, restarted.message)
})

test('AC-04 · 게임이 먼저 시작되면 이후 설정 저장은 거부되고 시작된 판의 설정은 그대로다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', {
        maxPlayers: 4, jokerCount: 1, dayDiscussionTime: 60, nightActionTime: 90,
    })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const started = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(started.ok, true, started.message)

    const rejected = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, dayDiscussionTime: 150 }),
    )
    assert.equal(rejected.ok, false)
    // 사유는 결정적이다. handleUpdateRoomSettings는 소속을 보기 **전에** 활성 세션 게이트를
    // 지나고(3단계), 시작 커밋이 이 계정의 playerSession을 이미 세워 두었으므로 언제나
    // ALREADY_IN_GAME이다 — "어느 쪽이든 저장은 안 된다"로 뭉뚱그리면 순서가 뒤바뀌어도
    // 시험이 통과한다.
    assert.equal(rejected.code, ROOM_SETTINGS_ERROR_CODES.ALREADY_IN_GAME)
    // 저장이 거부됐으므로 이 계정의 활성 세션은 그대로 그 게임 하나다.
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a')?.gameId, started.gameId)
})

test('AC-05 · 세션이 만들어진 뒤 대기방 설정 객체를 바꿔도 그 판의 역할·제한시간은 소급 변경되지 않는다', async () => {
    const room = {
        id: 'room-immutable',
        players: new Map([
            ['u1', { uuid: 'u1', nickname: 'n1', isReady: true }],
            ['u2', { uuid: 'u2', nickname: 'n2', isReady: true }],
            ['u3', { uuid: 'u3', nickname: 'n3', isReady: true }],
            ['u4', { uuid: 'u4', nickname: 'n4', isReady: true }],
        ]),
        settings: {
            maxPlayers: 4,
            jokerCount: 1,
            roleCompositionMode: 'custom',
            roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
            dayDiscussionTime: 60,
            dayVoteTime: 60,
            nightActionTime: 90,
            roleNightActionTimes: { JOKER: 30 },
        },
    }

    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    assert.equal(candidate.ok, true, candidate.reason)
    const { session } = candidate

    const rolesBefore = JSON.stringify([...session.players.values()].map((p) => [p.uuid, p.role]).sort())
    const timersBefore = JSON.stringify(session.timerSettings)

    // 대기방 쪽에서 일어날 수 있는 모든 변형을 흉내낸다: 객체 교체, 중첩 객체 변형.
    room.settings.dayDiscussionTime = 150
    room.settings.roleNightActionTimes.JOKER = 120
    room.settings.roleCounts.DOCTOR = 2
    room.settings = { maxPlayers: 10, jokerCount: 2, dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30 }

    assert.equal(JSON.stringify([...session.players.values()].map((p) => [p.uuid, p.role]).sort()), rolesBefore)
    assert.equal(JSON.stringify(session.timerSettings), timersBefore)
    assert.equal(session.timerSettings.dayDiscussionTime, 60)
    assert.equal(session.timerSettings.roleNightActionTimes.JOKER, 30)
})

test('AC-04 · 설정 변경 뒤에 도착한 옛 버전의 준비 요청은 해제 스냅샷을 되돌리지 못한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }))

    // v1을 보고 눌린 준비 요청이 이제야 도착했다.
    const late = await callAsPromise(handleSetReady, io, joinerSocket, 'p1', {
        isReady: true, roomId: room.roomId, expectedSettingsVersion: 1,
    })
    assert.equal(late.ok, false)
    assert.equal(late.code, ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT)
    assert.equal(late.settingsVersion, 2)

    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(stored.players.every(([, p]) => p.isReady === false))

    // 최신 버전을 들고 온 준비는 정상 처리되고, 응답에도 방·버전·revision이 실린다.
    const fresh = await callAsPromise(handleSetReady, io, joinerSocket, 'p1', {
        isReady: true, roomId: room.roomId, expectedSettingsVersion: 2,
    })
    assert.equal(fresh.ok, true)
    assert.equal(fresh.settingsVersion, 2)
    assert.equal(fresh.roomId, room.roomId)
    assert.equal(typeof fresh.readyRevision, 'number')
})

test('AC-04 · 방·설정 버전이 빠졌거나 형태가 틀린 준비/시작 요청은 거부되고 서버가 현재 값으로 채워 주지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    const badReady = [
        { isReady: true },                                                  // 둘 다 없음
        { isReady: true, roomId: room.roomId },                             // 버전 없음
        { isReady: true, expectedSettingsVersion: 1 },                      // 방 없음
        { isReady: true, roomId: '', expectedSettingsVersion: 1 },
        { isReady: true, roomId: room.roomId, expectedSettingsVersion: 0 },
        { isReady: true, roomId: room.roomId, expectedSettingsVersion: '1' },
        { isReady: true, roomId: room.roomId, expectedSettingsVersion: 1.5 },
    ]
    for (const payload of badReady) {
        const res = await callAsPromise(handleSetReady, io, hostSocket, 'host-a', payload)
        assert.equal(res.ok, false, `거부되지 않은 준비 요청: ${JSON.stringify(payload)}`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }
    const afterBadReady = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    assert.ok(afterBadReady.players.every(([, p]) => p.isReady === false), '거부된 요청이 준비 상태를 바꿨다')

    // 명시한 값을 갖춘 준비만 실제로 반영된다.
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const badStart = [
        undefined, null, 'not-an-object', ['roomId'],
        {},
        { roomId: room.roomId },
        { expectedSettingsVersion: 1 },
        { roomId: room.roomId, expectedSettingsVersion: 0 },
        { roomId: room.roomId, expectedSettingsVersion: '1' },
    ]
    for (const payload of badStart) {
        const res = await new Promise((resolve) => handleStartGame(io, hostSocket, 'host-a', payload, resolve))
        assert.equal(res.ok, false, `거부되지 않은 시작 요청: ${JSON.stringify(payload)}`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }
    assert.equal(startLoadoutCalls, 0, '형태가 틀린 시작 요청이 외형 조회까지 들어갔다')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null, '게임이 만들어졌다')
    assert.ok(gameRoomStillExists(room.roomId), '거부된 시작이 방을 없앴다')

    // 요청자가 보고 있던 방이 지금 소속과 다르면 그것도 거부된다.
    const otherRoom = await new Promise((resolve) => handleStartGame(
        io, hostSocket, 'host-a', { roomId: 'some-other-room', expectedSettingsVersion: 1 }, resolve))
    assert.equal(otherRoom.ok, false)
    assert.equal(otherRoom.code, 'ROOM_NOT_FOUND')

    const started = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room), resolve))
    assert.equal(started.ok, true, started.message)
})

test('AC-04 · 옛 설정 버전을 들고 온 시작 요청은 비동기 선행 작업에 들어가기 전에 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1 }))
    // 저장이 전원 준비를 해제했으므로 새 버전으로 다시 준비한다.
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', readyPayload(room, true, { settingsVersion: 2 }))
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room, true, { settingsVersion: 2 }))

    startLoadoutCalls = 0
    const stale = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room, { settingsVersion: 1 }), resolve))
    assert.equal(stale.ok, false, '옛 버전을 근거로 한 시작이 성공했다')
    assert.equal(stale.code, 'ROOM_STATE_CHANGED')
    assert.equal(stale.settingsVersion, 2, '충돌 응답이 현재 버전을 알려주지 않았다')
    assert.equal(startLoadoutCalls, 0, '이미 지난 버전의 요청이 외형 조회 비용을 썼다')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)

    const fresh = await new Promise((resolve) =>
        handleStartGame(io, hostSocket, 'host-a', startPayload(room, { settingsVersion: 2 }), resolve))
    assert.equal(fresh.ok, true, fresh.message)
    assert.equal(startLoadoutCalls, 1)
})

test('AC-04 · 실제 이벤트 등록부가 set_ready·start_game payload를 핸들러까지 전달한다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 4, jokerCount: 1 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    // 직접 핸들러 호출이 아니라 socket.on 배선을 통해 같은 계약이 지켜지는지 본다.
    matchmaking.registerMatchmakingHandlers(io, hostSocket, 'host-a')

    const readyNoVersion = await new Promise((resolve) =>
        hostSocket.trigger('set_ready', { isReady: true }, resolve))
    assert.equal(readyNoVersion.ok, false, '등록부가 방·버전 없는 준비 요청을 통과시켰다')
    assert.equal(readyNoVersion.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)

    const readyOk = await new Promise((resolve) =>
        hostSocket.trigger('set_ready', readyPayload(room), resolve))
    assert.equal(readyOk.ok, true, readyOk.message)
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', readyPayload(room))

    const staleStart = await new Promise((resolve) =>
        hostSocket.trigger('start_game', { roomId: room.roomId, expectedSettingsVersion: 99 }, resolve))
    assert.equal(staleStart.ok, false, '등록부가 payload를 버려 옛 버전 시작이 통과했다')
    assert.equal(staleStart.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null)

    const startedViaWire = await new Promise((resolve) =>
        hostSocket.trigger('start_game', startPayload(room), resolve))
    assert.equal(startedViaWire.ok, true, startedViaWire.message)
})

// ── AC-05: 재조회·방장 변경·결과 조회 ───────────────────────────────────────

test('AC-05 · 재접속 재조회는 최신 서버 설정을 돌려주고, 방장이 바뀌어도 같은 설정을 본다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { accessType: 'code', maxPlayers: 6, dayDiscussionTime: 120 }))

    // 재접속 흉내: 새 소켓으로 채널을 되돌린 뒤 현재 방을 다시 조회한다.
    const rejoinSocket = createFakeSocket('p1', { id: 'sock-p1-new' })
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket)
    await matchmaking.resyncRoomChannelOnReconnect(rejoinSocket, 'p1')
    const restored = await callAsPromise(handleGetCurrentRoom, 'p1')
    assert.equal(restored.room.settingsVersion, 2)
    assert.equal(restored.room.accessType, 'code')
    assert.equal(restored.room.settings.dayDiscussionTime, 120)

    // 방장이 떠나면 host_changed가 현재 설정 버전을 함께 알리고, 새 방장은 같은 설정을 본다.
    const before = io.broadcasts.length
    matchmaking.onDisconnect(io, hostSocket, 'host-a')
    matchmaking.__flushRoomRetentionForTests()

    const hostChanged = io.broadcasts.slice(before).filter((b) => b.event === 'host_changed')
    assert.equal(hostChanged.length, 1)
    assert.equal(hostChanged[0].payload.hostUuid, 'p1')
    assert.equal(hostChanged[0].payload.settingsVersion, 2)

    const asNewHost = await callAsPromise(handleGetCurrentRoom, 'p1')
    assert.equal(asNewHost.room.hostUuid, 'p1')
    assert.equal(asNewHost.room.settingsVersion, 2)
    assert.equal(asNewHost.room.settings.dayDiscussionTime, 120)
})

test('AC-05 · 결과 조회의 식별자 계약은 저장 요청과 같다(공백만·과길이는 기록을 읽기 전에 거부된다)', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const requestId = 'req-shared-contract'
    const saved = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }),
    )
    assert.equal(saved.ok, true, saved.message)

    const tooLong = 'x'.repeat(MAX_IDENTIFIER_LENGTH + 1)
    const invalidCases = [
        { roomId: '   ', requestId, label: '공백만 있는 roomId' },
        { roomId: room.roomId, requestId: '\t\n ', label: '공백만 있는 requestId' },
        { roomId: tooLong, requestId, label: '길이 상한을 넘는 roomId' },
        { roomId: room.roomId, requestId: tooLong, label: '길이 상한을 넘는 requestId' },
    ]

    const before = snapshotRooms()
    const broadcastsBefore = io.broadcasts.length
    for (const { roomId, requestId: rid, label } of invalidCases) {
        // 같은 값을 저장 요청으로 보내면 거부된다 — 조회만 통과하면 두 경로의 계약이 갈린다.
        const asSave = await callAsPromise(
            handleUpdateRoomSettings, io, hostSocket, 'host-a',
            updatePayload(room.roomId, { roomId, requestId: rid, expectedSettingsVersion: 2 }),
        )
        assert.equal(asSave.ok, false, `${label}: 저장 경로가 받아들였다(전제가 깨졌다)`)
        assert.equal(asSave.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)

        const asQuery = await callAsPromise(
            handleGetRoomSettingsUpdateResult, 'host-a', { roomId, requestId: rid },
        )
        assert.equal(asQuery.ok, false, `${label}: 조회 경로가 정상 응답을 돌려줬다`)
        assert.equal(asQuery.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, label)
        // 거부는 기록을 읽지도, 방 상태를 알려 주지도 않는다.
        assert.equal(asQuery.status, undefined, `${label}: 거부가 기록 상태를 노출했다`)
        assert.equal(asQuery.room, undefined, `${label}: 거부가 방 상태를 노출했다`)
    }
    assert.equal(snapshotRooms(), before, '거부된 조회가 방 상태를 바꿨다')
    assert.equal(io.broadcasts.length, broadcastsBefore, '거부된 조회가 방송을 냈다')

    // 상한 **경계 안**의 유효한 식별자는 그대로(보정 없이) 키로 쓰인다.
    const longButValid = 'r'.repeat(MAX_IDENTIFIER_LENGTH)
    const savedLong = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId: longButValid, expectedSettingsVersion: 2, maxPlayers: 5 }),
    )
    assert.equal(savedLong.ok, true, savedLong.message)
    const lookupLong = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId: longButValid },
    )
    assert.equal(lookupLong.ok, true)
    assert.equal(lookupLong.status, 'APPLIED')
    assert.equal(lookupLong.requestId, longButValid, '유효한 식별자가 그대로 보존되지 않았다')

    // 형태는 유효하지만 기록이 없는 요청은 여전히 UNKNOWN이다(거부와 구분된다).
    const unknown = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId: 'never-sent' },
    )
    assert.equal(unknown.ok, true)
    assert.equal(unknown.status, 'UNKNOWN')
})

test('AC-05 · ACK를 잃은 원 요청자는 같은 requestId 조회로 적용 여부를 확인하고, 타 계정 조회는 거부된다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')

    const requestId = 'req-lost-ack'
    // ACK 자체가 예외를 던져도 이미 커밋된 결과는 되돌아가지 않는다.
    handleUpdateRoomSettings(io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }),
        () => { throw new Error('ack 유실(테스트 주입)') })

    const lookup = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId },
    )
    assert.equal(lookup.ok, true)
    assert.equal(lookup.status, 'APPLIED')
    assert.equal(lookup.settingsVersion, 2)
    assert.equal(lookup.room.settingsVersion, 2)

    // 다른 계정은 같은 키로 조회해도 그 결과를 볼 수 없다.
    const otherAccount = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'p1', { roomId: room.roomId, requestId },
    )
    assert.equal(otherAccount.status, 'UNKNOWN')
    assert.ok(joinerSocket) // (조회가 다른 계정의 소속을 바꾸지 않았음을 아래에서 확인)

    // 기록이 없는 요청은 성공도 실패도 단정하지 않는다.
    const unknown = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId: 'never-sent' },
    )
    assert.equal(unknown.status, 'UNKNOWN')
    assert.equal(unknown.settingsVersion, undefined)
})

test('AC-05 · 결과 조회는 현재 소속을 스스로 검증하며, 방을 떠난 뒤에는 room을 주지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    await joinRoom(io, room.roomCode, 'p1')

    const requestId = 'req-left-room'
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))

    matchmaking.onDisconnect(io, hostSocket, 'host-a')
    matchmaking.__flushRoomRetentionForTests()

    const lookup = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId },
    )
    assert.equal(lookup.status, 'APPLIED', '적용 사실 자체는 여전히 알려줘야 한다')
    assert.equal(lookup.room, null, '더 이상 참가자가 아닌 계정에 방 상태를 줬다')
})

test('AC-05 · 방이 사라지면 그 방의 설정 변경 결과 기록도 함께 사라진다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    const requestId = 'req-room-gone'
    await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { requestId, maxPlayers: 6 }))
    assert.equal(matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 1)

    matchmaking.__testables.handleDeleteRoom(io, 'host-a')
    assert.equal(matchmaking.__getStateSnapshotForTests().roomSettingsUpdateResults.length, 0)

    const lookup = await callAsPromise(
        handleGetRoomSettingsUpdateResult, 'host-a', { roomId: room.roomId, requestId },
    )
    assert.equal(lookup.status, 'UNKNOWN')
})

// ── AC-06: 관전자 필드 부재 ─────────────────────────────────────────────────

test('AC-06 · 관전자 키는 수정 요청에서 거부되고, 예전 저장값에 섞여 있어도 응답으로 되살아나지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })
    await joinRoom(io, room.roomCode, 'p1')

    for (const spectatorKey of ['allowSpectators', 'allow-spectators', 'spectator', 'spectatorMode']) {
        const res = await callAsPromise(
            handleUpdateRoomSettings, io, hostSocket, 'host-a',
            { ...updatePayload(room.roomId), [spectatorKey]: true },
        )
        assert.equal(res.ok, false, `${spectatorKey}가 거부되지 않았다`)
        assert.equal(res.code, ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST)
    }

    // 예전 데이터에 관전자 키가 남아 있는 방을 재현한다 — 같은 방 객체의 settings만 바꾼다.
    const legacy = rawRoom(room.roomId)
    legacy.settings = { ...legacy.settings, allowSpectators: true, unknownLegacyKey: 'x' }
    matchmaking.__seedRoomForTests(legacy)

    const current = await callAsPromise(handleGetCurrentRoom, 'p1')
    assert.equal(Object.hasOwn(current.room.settings, 'allowSpectators'), false)
    assert.equal(Object.hasOwn(current.room.settings, 'unknownLegacyKey'), false)
    assert.equal(JSON.stringify(current.room).includes('pectator'), false)

    const list = await callAsPromise(handleGetPublicRooms)
    assert.equal(JSON.stringify(list.rooms).includes('pectator'), false)

    // 정상 저장을 한 번 더 하면 그 관전자 키는 저장에서도 사라진다.
    const saved = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6 }),
    )
    assert.equal(saved.ok, true, saved.message)
    const storedSettings = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    assert.equal(Object.hasOwn(storedSettings, 'allowSpectators'), false)
    assert.equal(Object.hasOwn(storedSettings, 'unknownLegacyKey'), false)
    // D-12의 세 값은 편집 대상이 아니지만 서버가 그대로 보존한다.
    assert.equal(storedSettings.lightsOut, false)
    assert.equal(storedSettings.soulBetting, false)
    assert.equal(storedSettings.voteReveal, true)
})

/** 스냅샷에서 현재 방의 원본 형태(Map 복원 포함)를 다시 만든다 — 관전자 키 주입용. */
function rawRoom(roomId) {
    const snapshot = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === roomId)
    const room = snapshot[1]
    return { ...room, players: new Map(room.players) }
}

test('AC-06 · 저장 뒤 입력 객체를 변형해도 서버 저장값은 바뀌지 않는다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 2 })

    const payload = updatePayload(room.roomId, {
        maxPlayers: 6,
        jokerCount: 1,
        roleCompositionMode: 'custom',
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
        roleNightActionTimes: { JOKER: 30 },
    })
    const res = await callAsPromise(handleUpdateRoomSettings, io, hostSocket, 'host-a', payload)
    assert.equal(res.ok, true, res.message)

    payload.roleCounts.JOKER = 99
    payload.roleNightActionTimes.JOKER = 9999
    payload.maxPlayers = 10

    const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    assert.equal(stored.maxPlayers, 6)
    assert.equal(stored.roleCounts.JOKER, 1)
    assert.equal(stored.roleNightActionTimes.JOKER, 30)

    // 응답 객체를 변형해도 마찬가지다.
    const current = await callAsPromise(handleGetCurrentRoom, 'host-a')
    current.room.settings.maxPlayers = 10
    current.room.settings.roleCounts.JOKER = 99
    const after = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
    assert.equal(after.maxPlayers, 6)
    assert.equal(after.roleCounts.JOKER, 1)
})
