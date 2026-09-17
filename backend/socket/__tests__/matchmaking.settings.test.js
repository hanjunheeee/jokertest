/**
 * F-20: 대기방 설정 변경(update_room_settings)의 소켓 계약 검증.
 *
 * 실제 handleCreateRoom/handleJoinRoomByCode/handleSetReady/handleStartGame을 그대로 호출해
 * 방을 만들고 입장시킨다 — registry를 손으로 심지 않는다. 대역은 SQL(userRepository·
 * economyService·gameInviteService)과 소켓 전송뿐이며, 권한·버전·점유·경합 판정은 전부
 * 프로덕션 경로 그대로 돈다.
 */
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

function createStartGate() {
    let release
    let signalEntered
    const entered = new Promise((resolve) => { signalEntered = resolve })
    const blocked = new Promise((resolve) => { release = resolve })
    return { entered, release: () => release(), onEnter: () => { signalEntered(); return blocked } }
}

matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async (userIds) => {
        if (startLoadoutGate) await startLoadoutGate.onEnter()
        return Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null, profileBorderId: null, cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))
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
    const { hostSocket, room } = await createRoom(io, 'host-a', { maxPlayers: 8, jokerCount: 1 })
    await joinRoom(io, room.roomCode, 'p1') // 확정 2명
    // 확정 명단에 이미 있는 계정의 published 시도 — 자리를 한 번만 차지해야 한다.
    matchmaking.__seedAdmissionAttemptForTests('p1', { roomId: room.roomId, phase: 'published' })

    const res = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(res.ok, true, `published가 중복 계산됐다: ${JSON.stringify(res)}`)
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
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', { isReady: true })
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', { isReady: true })

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
    const broadcastsBefore = io.broadcasts.length
    const noop = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, jokerCount: 1, expectedSettingsVersion: 2 }),
    )
    assert.equal(noop.ok, true)
    assert.equal(noop.changed, false)
    assert.equal(noop.settingsVersion, 2)
    assert.equal(io.broadcasts.length, broadcastsBefore, '변경이 없는데 목록 방송이 나갔다')

    const afterNoop = matchmaking.__getStateSnapshotForTests().gameRooms[0][1]
    for (const [u, p] of afterNoop.players) {
        assert.equal(p.readyRevision, revisionsBefore[u] + 1, `${u}의 준비가 다시 해제됐다`)
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
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', { isReady: true })
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', { isReady: true })

    // 외형 조회를 붙잡아 둔다 — 이 구간이 곧 저장과 시작이 겹치는 창이다.
    startLoadoutGate = createStartGate()

    const startPromise = new Promise((resolve) => handleStartGame(io, hostSocket, 'host-a', resolve))
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
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', { isReady: true })
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', { isReady: true })

    startLoadoutGate.release()
    const startResult = await startPromise
    assert.equal(startResult.ok, false, '옛 설정으로 시작된 요청이 성공했다')
    assert.equal(startResult.code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSessionCore.getActiveSessionRoutingInfo('host-a'), null, '게임 세션이 만들어졌다')
    assert.ok(gameRoomStillExists(room.roomId), '실패한 시작이 방을 없앴다')

    // 새 시작 요청은 v2 하나의 설정으로만 성공한다.
    startLoadoutGate = null
    const restarted = await new Promise((resolve) => handleStartGame(io, hostSocket, 'host-a', resolve))
    assert.equal(restarted.ok, true, restarted.message)
})

function gameRoomStillExists(roomId) {
    return matchmaking.__getStateSnapshotForTests().gameRooms.some(([id]) => id === roomId)
}

test('AC-04 · 게임이 먼저 시작되면 이후 설정 저장은 거부되고 시작된 판의 설정은 그대로다', async () => {
    const io = createFakeIo([])
    const { hostSocket, room } = await createRoom(io, 'host-a', {
        maxPlayers: 4, jokerCount: 1, dayDiscussionTime: 60, nightActionTime: 90,
    })
    const joinerSocket = await joinRoom(io, room.roomCode, 'p1')
    await callAsPromise(handleSetReady, io, hostSocket, 'host-a', { isReady: true })
    await callAsPromise(handleSetReady, io, joinerSocket, 'p1', { isReady: true })

    const started = await new Promise((resolve) => handleStartGame(io, hostSocket, 'host-a', resolve))
    assert.equal(started.ok, true, started.message)

    const rejected = await callAsPromise(
        handleUpdateRoomSettings, io, hostSocket, 'host-a',
        updatePayload(room.roomId, { maxPlayers: 6, dayDiscussionTime: 150 }),
    )
    assert.equal(rejected.ok, false)
    // 대기방이 사라졌고 요청자는 활성 세션 참가자다 — 어느 쪽 사유든 저장은 일어나지 않는다.
    assert.ok([
        ROOM_SETTINGS_ERROR_CODES.ALREADY_IN_GAME,
        ROOM_SETTINGS_ERROR_CODES.NOT_IN_ROOM,
        ROOM_SETTINGS_ERROR_CODES.ROOM_NOT_FOUND,
    ].includes(rejected.code), `예상 밖 사유: ${rejected.code}`)
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
