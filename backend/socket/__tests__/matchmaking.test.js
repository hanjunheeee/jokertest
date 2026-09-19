// backend/models는 require 시점에 DATABASE_URL을 **파싱만** 한다(연결은 시도하지 않는다).
// npm test(--env-file=.env.test) 밖에서 이 파일만 직접 실행하면 그 값이 비어 있어 require
// 자체가 죽으므로, 같은 디렉터리의 gameSession.test.js·gameSession.dayTimers.test.js·
// matchmaking.gameInvite.test.js와 **같은 관례**로 더미 폴백을 둔다(값도 .env.test와 동일).
// 이미 설정돼 있으면 덮지 않으므로 공식 명령의 동작은 그대로다. SQL 경계는 아래에서 전부
// 대역으로 교체되므로 이 파일에서 실제 쿼리는 한 번도 실행되지 않는다.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

// userRepository는 실제 DB(Sequelize)에 접근하고, require 시점에 backend/models(DATABASE_URL
// 필요)까지 함께 불러온다. node:test의 mock.module()로 가로채는 방법을 먼저 시도했으나
// --experimental-test-module-mocks 플래그를 켜도 원본 모듈이 그대로 로드되며 Sequelize
// 초기화가 실패해(직접 실행해 확인) 이 프로젝트 구조에서는 쓸 수 없었다. 대신 matchmaking.js가
// 제공하는 __setUserRepositoryForTests로 내부 참조만 교체하는 의존성 주입 방식을 쓴다.
let fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
// F-13(AC-05): economy.service.js도 userRepository와 같은 이유(실제 호출 시 backend/models가
// 필요한 실제 DB 연결을 요구)로 fake를 주입한다. 기본값은 모든 uuid에 대해 사진·테두리
// 모두 미지정(null)으로 응답한다 — 이 기본값을 검증하는 테스트만 실제 값을 오버라이드한다.
let fakeGetPublicProfileLoadouts = async (userIds) =>
    Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]))
// F-14(AC-01/AC-04): captureRoomStartProfiles(게임 시작 직전 스냅샷)는 loadRoomParticipantProfile
// (참가 시점)과 달리 getGameStartLoadouts를 부른다 — 공개(사진·테두리·카드 프레임)와 비공개
// (직업별 스킨) 정보를 함께 돌려준다. 기본값은 모든 필드 미지정(null/전부-null 맵)이다.
let fakeGetGameStartLoadouts = async (userIds) =>
    Object.fromEntries(userIds.map((id) => [id, {
        profilePhotoId: null,
        profileBorderId: null,
        cardFrameId: null,
        skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
    }]))

const matchmaking = require('../matchmaking')
matchmaking.__setUserRepositoryForTests({
    findByUuid: (...args) => fakeFindByUuid(...args),
})
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: (...args) => fakeGetPublicProfileLoadouts(...args),
    getGameStartLoadouts: (...args) => fakeGetGameStartLoadouts(...args),
})
// 방 소멸·시작 시 fire-and-forget으로 도는 초대 정리(gameInvite.service)는 실제 MySQL을
// 요구한다. 대역이 없으면 이 순수 단위 스위트가 실제 DB 접속을 시도해 AccessDenied 로그를
// 남긴다 — 단언이 실패하지는 않지만 "SQL 경계를 건드리지 않는다"는 전제가 깨진다.
matchmaking.__setGameInviteServiceForTests({
    cancelPendingInvitesForRoom: async () => {},
})
// game-core/gameSession.js는 matchmaking.js와 별도 모듈이라 자체 registry(gameSessions/
// playerSession/roomGameSession)를 갖는다 — matchmaking.__resetStateForTests()로는 초기화되지
// 않으므로 이 파일의 beforeEach에서 별도로 초기화한다(테스트 간 상태 누수 방지).
const gameSession = require('../../game-core/gameSession')
const { ROOM_JOIN_ERROR_CODES } = require('../roomJoinErrors')
const {
    handleCreateRoom,
    handleJoinRoomByCode,
    handleGetCurrentRoom,
    handleGetPublicRooms,
    handleJoinPublicRoom,
    handleJoinMatchmaking,
    handleStartGame,
    handleSetReady,
    leaveSocketRoomSafely,
} = matchmaking.__testables

function deferred() {
    let resolve
    const promise = new Promise((res) => { resolve = res })
    return { promise, resolve }
}

// createFakeSocket/createFakeIo/callAsPromise/validSettingsPayload/countingCallback/
// setupReadyRoomForStart는 backend/socket/__tests__/gameSession.test.js도 실제
// handleStartGame 등을 구동하는 통합 테스트에서 그대로 재사용해야 해서 공유 fixture
// 파일로 추출했다(동작 변경 없음 — 순수 이동).
const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    // F-20(AC-04): set_ready/start_game은 roomId·expectedSettingsVersion을 필수로 요구한다.
    // 실제 클라이언트가 보내는 것과 같은 모양을 이 두 헬퍼가 만든다.
    readyPayload,
    startPayload,
    countingCallback,
    setupReadyRoomForStart,
} = require('./testHelpers/matchmakingFixtures')

test.beforeEach(() => {
    matchmaking.__resetStateForTests()
    gameSession.__resetStateForTests()
    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
    fakeGetPublicProfileLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]))
})

// ── create_room ──────────────────────────────────────────────────────────

test('create_room: 인증 uuid가 host/player로 쓰이고 payload의 uuid/hostUuid는 무시된다', async () => {
    const socket = createFakeSocket('uuid-A')
    const io = createFakeIo([socket])

    const res = await callAsPromise(
        handleCreateRoom, io, socket, 'uuid-A',
        validSettingsPayload({ uuid: 'attacker', hostUuid: 'attacker' })
    )

    assert.equal(res.ok, true)
    assert.equal(res.room.hostUuid, 'uuid-A')
    assert.deepEqual(res.room.players.map((p) => p.uuid), ['uuid-A'])

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1)
    assert.equal(snapshot.playerRoom[0][0], 'uuid-A')
})

test('create_room: 정상 생성 시 Socket room 가입과 Map 반영이 이루어지고, ack에 내부 필드가 없다', async () => {
    const socket = createFakeSocket('uuid-B')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-B', validSettingsPayload())

    assert.equal(res.ok, true)
    // F-20(AC-03/AC-06): 참가자용 방 응답의 **승인된** 최상위 계약이다. accessType·
    // settingsVersion·settings가 새로 추가됐지만 이 목록이 여전히 전부여야 한다 — 즉
    // 이 단언은 "새 필드가 들어왔다"가 아니라 "허용한 것 말고는 아무것도 안 나간다"를 고정한다.
    // F-21(AC-02/AC-04): bootEpoch·roomInstanceId가 승인 목록에 더해졌다 — 추방 요청이 "내가
    // 보고 있던 그 방, 그 서버 기동"을 가리키는지 서버가 확인하는 유일한 근거다.
    assert.deepEqual(Object.keys(res.room).sort(),
        ['accessType', 'bootEpoch', 'canStart', 'hostUuid', 'players', 'roomCode', 'roomId',
            'roomInstanceId', 'settings', 'settingsVersion'])
    // 서버 내부 필드 비공개(이 시험의 원래 핵심). 위 exact-key 단언과 중복이지만, 어떤 이름이
    // 왜 금지인지를 이름으로 남겨 둬야 나중에 목록을 넓힐 때 실수로 함께 통과하지 않는다.
    //
    // F-21: roomInstanceId는 이 목록에서 빠졌다 — 더 이상 내부 값이 아니라 **승인된 공개
    // 계약**이기 때문이다. 방장의 추방 요청이 "같은 문자열 roomId로 다시 만들어진 방"이
    // 아니라 자기가 보고 있던 그 방을 가리킨다는 것을 서버가 확인하려면, 클라이언트가 그
    // 값을 알고 되돌려 보낼 수 있어야 한다(AC-04). 비밀이 아니다 — roomId·roomCode와 같은
    // 수준의 방 식별자다. 나머지 이름은 그대로 금지다.
    for (const internal of ['id', 'code', 'title', 'status', 'createdAt',
        'generation', 'readyRevision']) {
        assert.equal(Object.hasOwn(res.room, internal), false, `내부 필드 ${internal}가 ack에 실렸다`)
    }
    // F-20(AC-06): 새로 공개되는 중첩 settings도 승인된 키만 담는다 — 저장 값을 그대로
    // 내보내지 않는 경계(buildRoomSettingsView)가 실제로 동작하는지 여기서 고정한다.
    assert.deepEqual(Object.keys(res.room.settings).sort(),
        ['dayDiscussionTime', 'dayVoteTime', 'jokerCount', 'lightsOut', 'maxPlayers',
            'nightActionTime', 'roleCompositionMode', 'soulBetting', 'voteReveal'])
    assert.equal(JSON.stringify(res.room).includes('pectator'), false, '관전자 필드가 응답에 실렸다')
    assert.equal(res.room.accessType, 'open')
    assert.equal(res.room.settingsVersion, 1) // 생성 시 서버가 부여하는 최초 확정본
    assert.equal(socket.joined.length, 1)
    assert.equal(socket.joined[0], res.room.roomId)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    assert.equal(room.title, 'user-uuid-B의 방')
    assert.equal(room.accessType, 'open')
    assert.equal(room.settings.maxPlayers, 8)
})

// ── F-13 AC-05: 인증 계정 loadout이 room.players에 실린다 ────────────────────────

test('create_room: 방장의 서버 공개 프로필(사진·테두리)이 room.players 항목에 실린다', async () => {
    fakeGetPublicProfileLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: 'player-profile-기사', profileBorderId: 'profile-border-귀족' }]))

    const socket = createFakeSocket('uuid-profile-create')
    const io = createFakeIo([socket])
    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-profile-create', validSettingsPayload())

    assert.equal(res.ok, true)
    const [host] = res.room.players
    assert.equal(host.accountProfilePhotoId, 'player-profile-기사')
    assert.equal(host.accountProfileBorderId, 'profile-border-귀족')
})

test('create_room: 계정 프로필 조회가 실패하면 기본 외형으로 조용히 넘어가지 않고 방 생성 자체가 실패한다', async () => {
    fakeGetPublicProfileLoadouts = async () => { throw new Error('economy 조회 실패(테스트 주입)') }

    const socket = createFakeSocket('uuid-profile-create-fail')
    const io = createFakeIo([socket])
    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-profile-create-fail', validSettingsPayload())

    assert.equal(res.ok, false)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0, '계정 외형을 확보하지 못했으면 방이 커밋되면 안 된다')
})

test('join_room_by_code: 참가자의 서버 공개 프로필(사진·테두리)이 room.players 항목에 실린다', async () => {
    const hostSocket = createFakeSocket('uuid-profile-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-profile-host', validSettingsPayload())

    fakeGetPublicProfileLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, { profilePhotoId: 'player-profile-드워프', profileBorderId: 'profile-border-남작' }]))

    const joinerSocket = createFakeSocket('uuid-profile-joiner')
    io.sockets.sockets.set(joinerSocket.id, joinerSocket)
    await handleJoinRoomByCode(io, joinerSocket, 'uuid-profile-joiner', created.room.roomCode)

    const joinedPayload = joinerSocket.emitted.find((e) => e.event === 'room_joined').payload
    const joinerEntry = joinedPayload.players.find((p) => p.uuid === 'uuid-profile-joiner')
    assert.equal(joinerEntry.accountProfilePhotoId, 'player-profile-드워프')
    assert.equal(joinerEntry.accountProfileBorderId, 'profile-border-남작')
})

// F-13 AC-05(공개 응답 안전성) — loadRoomParticipantProfile은 economyService.getPublicProfileLoadouts의
// 반환값에서 profilePhotoId/profileBorderId 두 필드만 꺼내 accountProfilePhotoId/
// accountProfileBorderId로 옮긴다(economy.service.js 참고, 지갑·소유 목록은 그 함수 자체가
// 절대 포함하지 않는다). 이 테스트는 그 계약이 room.players 공개 payload까지 그대로 지켜지는지
// — 즉 fake economyService가 실수로라도 추가 필드(잔액·소유 목록 등)를 흘려도 room.players
// 항목에는 알려진 안전한 키만 남는지 — 못박는다. 새 필드가 room.players에 늘어나면 이 테스트가
// 먼저 깨져, 의도치 않은 공개 노출을 경고한다.
test('create_room: room.players 항목은 알려진 안전한 키만 갖는다(economyService가 잔액 등 여분 필드를 흘려도 새어나가지 않는다)', async () => {
    fakeGetPublicProfileLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [
            id,
            {
                profilePhotoId: 'player-profile-기사',
                profileBorderId: 'profile-border-귀족',
                // 아래 두 필드는 실제 economyService.getPublicProfileLoadouts가 절대 포함하지
                // 않지만, "혹시 흘러도 이쪽에서 막힌다"를 증명하기 위해 fake에서만 주입한다.
                balanceGold: 999999,
                entitlements: ['secret-item'],
            },
        ]))

    const socket = createFakeSocket('uuid-profile-safe-keys')
    const io = createFakeIo([socket])
    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-profile-safe-keys', validSettingsPayload())

    assert.equal(res.ok, true)
    const [host] = res.room.players
    assert.deepEqual(
        Object.keys(host).sort(),
        // F-21(AC-06): membershipId는 서버가 발급하는 이 방에서의 소속 식별자다(추방 대상 지목의
        // 근거). 잔액 등 계정 내부 값은 여전히 하나도 새어나가지 않는다.
        ['accountProfileBorderId', 'accountProfilePhotoId', 'isReady', 'membershipId', 'nickname', 'uuid'],
    )
})

test('create_room: callback이 없는 요청은 어떤 상태도 바꾸지 않는다', () => {
    const before = matchmaking.__getStateSnapshotForTests()
    const socket = createFakeSocket('uuid-C')
    const io = createFakeIo([socket])

    handleCreateRoom(io, socket, 'uuid-C', validSettingsPayload(), undefined)

    const after = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(after, before)
})

test('create_room: 동일 사용자의 빠른 더블클릭/동시 요청에서 방이 하나만 생성된다', async () => {
    const socket = createFakeSocket('uuid-D')
    const io = createFakeIo([socket])
    const payload = validSettingsPayload()

    const p1 = callAsPromise(handleCreateRoom, io, socket, 'uuid-D', payload)
    const p2 = callAsPromise(handleCreateRoom, io, socket, 'uuid-D', payload)
    const [r1, r2] = await Promise.all([p1, p2])

    const results = [r1, r2]
    const successes = results.filter((r) => r.ok)
    const failures = results.filter((r) => !r.ok)
    assert.equal(successes.length, 1)
    assert.equal(failures.length, 1)
    assert.match(failures[0].message, /처리 중/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1)
})

test('create_room: 이미 방에 있는 사용자는 거부된다', async () => {
    const socket = createFakeSocket('uuid-E')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-E', validSettingsPayload())

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-E', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /이미 참여 중/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 1) // 두 번째 시도로 방이 더 생기지 않음
})

test('create_room: 매칭 대기열에 남은 사용자는 자동 제거되지 않고 거부된다', async () => {
    matchmaking.__seedMatchmakingQueueForTests('uuid-F', { uuid: 'uuid-F', nickname: 'x', socketId: 'sock-F' })
    const socket = createFakeSocket('uuid-F')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-F', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /매칭 대기열/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.matchmakingQueue.length, 1) // 자동으로 큐에서 빠지지 않음(정책)
    assert.equal(snapshot.gameRooms.length, 0)
})

test('create_room: 사용자 조회가 null을 반환하면 실패 응답을 보낸다', async () => {
    fakeFindByUuid = async () => null
    const socket = createFakeSocket('uuid-G')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-G', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.match(res.message, /사용자 정보/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.pendingRoomTransitions.length, 0) // 예약 해제 확인
})

test('create_room: 사용자 조회가 예외를 던지면 예약이 해제되고 고정 오류 메시지를 응답한다', async () => {
    fakeFindByUuid = async () => { throw new Error('DB 커넥션 실패(내부 상세)') }
    const socket = createFakeSocket('uuid-H')
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-H', validSettingsPayload())
    assert.equal(res.ok, false)
    assert.equal(res.message, '방을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.')
    assert.ok(!res.message.includes('DB 커넥션')) // 내부 오류 상세가 노출되지 않음

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.pendingRoomTransitions.length, 0)

    // 예약이 실제로 풀렸는지 재시도로 재확인
    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
    const retry = await callAsPromise(handleCreateRoom, io, socket, 'uuid-H', validSettingsPayload())
    assert.equal(retry.ok, true)
})

test('create_room: socket.join() 실패 시 gameRooms/playerRoom에 흔적이 남지 않고 재시도가 가능하다', async () => {
    const socket = createFakeSocket('uuid-I', { joinShouldReject: true })
    const io = createFakeIo([socket])

    const res = await callAsPromise(handleCreateRoom, io, socket, 'uuid-I', validSettingsPayload())
    assert.equal(res.ok, false)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
    assert.equal(snapshot.pendingRoomTransitions.length, 0)

    socket.joinShouldReject = false
    const retry = await callAsPromise(handleCreateRoom, io, socket, 'uuid-I', validSettingsPayload())
    assert.equal(retry.ok, true)
})

// ── join_room_by_code ───────────────────────────────────────────────────

test('join_room_by_code: 빈 코드/존재하지 않는 방을 거부한다', async () => {
    const socket = createFakeSocket('uuid-J')
    const io = createFakeIo([socket])

    await handleJoinRoomByCode(io, socket, 'uuid-J', '  ')
    assert.match(socket.emitted.at(-1).payload.message, /코드를 입력/)
    assert.equal(socket.emitted.at(-1).payload.code, ROOM_JOIN_ERROR_CODES.CODE_REQUIRED)

    await handleJoinRoomByCode(io, socket, 'uuid-J', 'ZZZZZZ')
    assert.match(socket.emitted.at(-1).payload.message, /일치하는 방이 없습니다/)
    assert.equal(socket.emitted.at(-1).payload.code, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH)
})

// ── 비밀방(code) 입장 가드: 코드 검증을 우회하는 모든 표면을 서버가 막는지 ─────────

/** 테스트용 code 방(비밀방)을 gameRooms에 직접 심고 그 방 객체를 돌려준다. */
function seedCodeRoom({ id, code, hostUuid, players = [hostUuid], maxPlayers = 8 }) {
    const room = {
        id,
        code,
        hostUuid,
        title: `${hostUuid}의 방`,
        accessType: 'code',
        players: new Map(players.map((uuid) => [uuid, { uuid, nickname: `user-${uuid}`, isReady: false }])),
        settings: { ...validSettingsPayload({ accessType: 'code', maxPlayers }) },
    }
    matchmaking.__seedRoomForTests(room)
    return room
}

test('join_public_room: 조작된 roomId로 code 방에 코드 없이 들어오려는 시도를 서버가 거부한다', async () => {
    // 목록 DTO에는 코드가 없으므로, 클라이언트가 할 수 있는 우회는 "코드 방의 roomId를
    // 공개방 참가 이벤트로 그대로 보내는 것"뿐이다 — 그 표면을 정면으로 겨눈다.
    const secret = seedCodeRoom({ id: 'secret-room', code: 'SECRET', hostUuid: 'uuid-secret-host' })
    const attacker = createFakeSocket('uuid-bypass')
    const io = createFakeIo([attacker])

    await handleJoinPublicRoom(io, attacker, 'uuid-bypass', { roomId: secret.id })

    const failed = attacker.emitted.find((e) => e.event === 'room_join_failed')
    assert.ok(failed, '코드 방 우회 입장은 거부되어야 합니다')
    assert.equal(failed.payload.code, ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH)
    assert.equal(attacker.emitted.some((e) => e.event === 'room_joined'), false)

    // 거부는 "응답만 실패"로 끝나면 안 된다 — Socket room·playerRoom·방 인원 어디에도
    // 흔적이 남지 않아야 다음 요청이 이 잔여 상태를 발판으로 삼을 수 없다.
    assert.equal(attacker.joined.length, 0)
    assert.equal(attacker.currentRooms.has(secret.id), false)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([uuid]) => uuid === 'uuid-bypass'), false)
    const [, storedRoom] = snapshot.gameRooms.find(([id]) => id === secret.id)
    assert.equal(storedRoom.players.some(([uuid]) => uuid === 'uuid-bypass'), false)
})

test('join_room_by_code: 코드 없이/빈 코드/틀린 코드로는 code 방에 입장하지 못한다', async () => {
    const secret = seedCodeRoom({ id: 'secret-room-2', code: 'SECRET', hostUuid: 'uuid-secret-host2' })

    const cases = [
        { label: '코드 없음', code: undefined, expected: ROOM_JOIN_ERROR_CODES.CODE_REQUIRED },
        { label: '빈 문자열', code: '', expected: ROOM_JOIN_ERROR_CODES.CODE_REQUIRED },
        { label: '공백뿐', code: '   ', expected: ROOM_JOIN_ERROR_CODES.CODE_REQUIRED },
        { label: '틀린 코드', code: 'WRONG1', expected: ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH },
        // 대소문자만 다른 코드도 통과시키지 않는다(코드 비교는 정확 일치여야 한다).
        { label: '대소문자 불일치', code: 'secret', expected: ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH },
    ]

    for (const { label, code, expected } of cases) {
        const joiner = createFakeSocket(`uuid-wrong-${label}`)
        const io = createFakeIo([joiner])

        await handleJoinRoomByCode(io, joiner, `uuid-wrong-${label}`, code)

        const failed = joiner.emitted.find((e) => e.event === 'room_join_failed')
        assert.ok(failed, `${label}: 거부되어야 합니다`)
        assert.equal(failed.payload.code, expected, label)
        assert.equal(joiner.emitted.some((e) => e.event === 'room_joined'), false, label)
        assert.equal(joiner.joined.length, 0, label)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, storedRoom] = snapshot.gameRooms.find(([id]) => id === secret.id)
    assert.equal(storedRoom.players.length, 1) // host 외에 아무도 들어오지 못했다
    assert.equal(snapshot.playerRoom.filter(([uuid]) => uuid.startsWith('uuid-wrong-')).length, 0)
})

test('join_room_by_code: 선택한 비밀방 roomId가 있으면 방 없음과 코드 불일치를 구분한다', async () => {
    const secret = seedCodeRoom({ id: 'selected-secret', code: 'SECRET', hostUuid: 'uuid-selected-host' })

    const mismatchSocket = createFakeSocket('uuid-selected-mismatch')
    await handleJoinRoomByCode(
        createFakeIo([mismatchSocket]),
        mismatchSocket,
        'uuid-selected-mismatch',
        'WRONG1',
        { roomId: secret.id, accessType: 'code' },
    )
    assert.equal(
        mismatchSocket.emitted.find((event) => event.event === 'room_join_failed')?.payload?.code,
        ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH,
    )

    const missingSocket = createFakeSocket('uuid-selected-missing')
    await handleJoinRoomByCode(
        createFakeIo([missingSocket]),
        missingSocket,
        'uuid-selected-missing',
        'SECRET',
        { roomId: 'missing-secret', accessType: 'code' },
    )
    assert.equal(
        missingSocket.emitted.find((event) => event.event === 'room_join_failed')?.payload?.code,
        ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND,
    )
})

test('입장 거부 사유(코드 불일치·방 없음·이미 시작됨·정원 초과)는 서로 다른 안정적 코드로 응답된다', async () => {
    const codeOf = (socket) => socket.emitted.find((e) => e.event === 'room_join_failed')?.payload?.code

    // 1) 코드 불일치 — 어느 방과도 맞지 않는 코드
    const mismatchSocket = createFakeSocket('uuid-reason-mismatch')
    const io = createFakeIo([mismatchSocket])
    await handleJoinRoomByCode(io, mismatchSocket, 'uuid-reason-mismatch', 'NOSUCH')

    // 2) 방 없음 — 존재하지 않는 roomId를 지목한 공개방 참가
    const notFoundSocket = createFakeSocket('uuid-reason-notfound')
    io.sockets.sockets.set(notFoundSocket.id, notFoundSocket)
    await handleJoinPublicRoom(io, notFoundSocket, 'uuid-reason-notfound', { roomId: 'no-such-room' })

    // 3) 정원 초과 — 올바른 코드지만 이미 정원이 찬 방
    seedCodeRoom({
        id: 'reason-full-room',
        code: 'FULL01',
        hostUuid: 'uuid-reason-fullhost',
        players: ['uuid-reason-fullhost', 'uuid-reason-f2', 'uuid-reason-f3', 'uuid-reason-f4'],
        maxPlayers: 4,
    })
    const fullSocket = createFakeSocket('uuid-reason-full')
    io.sockets.sockets.set(fullSocket.id, fullSocket)
    await handleJoinRoomByCode(io, fullSocket, 'uuid-reason-full', 'FULL01')

    // 4) 이미 시작됨 — 실제로 게임을 시작시킨 뒤 그 방의 코드로 뒤늦게 들어온다.
    //    시작된 방은 gameRooms에서 지워지므로, 별도 근거 없이는 "방 없음"과 구분되지 않는다.
    const { room: startedRoom } = await setupReadyRoomForStart(io, 'uuid-reason-host', 'uuid-reason-joiner', {
        handleCreateRoom, handleJoinRoomByCode, handleSetReady,
    })
    const startAck = await callAsPromise(
        handleStartGame, io, io.sockets.sockets.get('sock-uuid-reason-host'), 'uuid-reason-host',
        startPayload(startedRoom),
    )
    assert.equal(startAck.ok, true, '이 검증의 전제인 게임 시작이 실패했습니다')

    const startedSocket = createFakeSocket('uuid-reason-started')
    io.sockets.sockets.set(startedSocket.id, startedSocket)
    await handleJoinRoomByCode(io, startedSocket, 'uuid-reason-started', startedRoom.roomCode)

    assert.equal(codeOf(mismatchSocket), ROOM_JOIN_ERROR_CODES.ROOM_CODE_MISMATCH)
    assert.equal(codeOf(notFoundSocket), ROOM_JOIN_ERROR_CODES.ROOM_NOT_FOUND)
    assert.equal(codeOf(fullSocket), ROOM_JOIN_ERROR_CODES.ROOM_FULL)
    assert.equal(codeOf(startedSocket), ROOM_JOIN_ERROR_CODES.ROOM_ALREADY_STARTED)

    // 네 사유가 실제로 서로 다른 값이어야 클라이언트가 사유별로 분기할 수 있다.
    const codes = [mismatchSocket, notFoundSocket, fullSocket, startedSocket].map(codeOf)
    assert.equal(new Set(codes).size, 4)
    // 사람이 읽는 message도 함께 유지된다(기존 수신자 호환).
    for (const socket of [mismatchSocket, notFoundSocket, fullSocket, startedSocket]) {
        assert.equal(typeof socket.emitted.find((e) => e.event === 'room_join_failed').payload.message, 'string')
    }
})

test('공개 방 목록 DTO는 code 방 여부는 알려주되 실제 입장 코드는 노출하지 않는다', async () => {
    const host = createFakeSocket('uuid-dto-codehost')
    const io = createFakeIo([host])
    const created = await callAsPromise(
        handleCreateRoom, io, host, 'uuid-dto-codehost', validSettingsPayload({ accessType: 'code' }),
    )
    const actualCode = created.room.roomCode
    assert.equal(typeof actualCode, 'string')

    const listed = await callAsPromise(handleGetPublicRooms)
    const broadcast = io.broadcasts.find((entry) => entry.event === 'public_rooms_updated')
    assert.ok(broadcast, '방 생성 직후 목록 방송이 있어야 합니다')

    // 요청-응답 경로와 브로드캐스트 경로 둘 다 같은 빌더를 써야 한 쪽으로만 코드가 새지 않는다.
    for (const dto of [...listed.rooms, ...broadcast.payload.rooms]) {
        // 자물쇠 표시의 근거인 accessType은 남아 있어야 한다.
        assert.equal(dto.accessType, 'code')
        assert.equal(Object.hasOwn(dto, 'code'), false)
        assert.equal(Object.hasOwn(dto, 'roomCode'), false)
        // 필드 이름을 바꿔 담는 실수까지 잡기 위해 값 자체가 어디에도 없는지 확인한다.
        assert.equal(Object.values(dto).includes(actualCode), false)
    }
})

test('join_room_by_code: 방별 maxPlayers를 적용해 4인 방의 5번째 참가를 거부한다', async () => {
    const hostSocket = createFakeSocket('uuid-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }))
    const { roomCode } = created.room

    for (const uuid of ['uuid-p1', 'uuid-p2', 'uuid-p3']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    assert.equal(room.players.length, 4) // host + 3명 = 정원 4 도달

    const fifthSocket = createFakeSocket('uuid-p4')
    io.sockets.sockets.set(fifthSocket.id, fifthSocket)
    await handleJoinRoomByCode(io, fifthSocket, 'uuid-p4', roomCode)
    assert.match(fifthSocket.emitted.at(-1).payload.message, /가득 찼습니다/)

    const after = matchmaking.__getStateSnapshotForTests()
    assert.equal(after.gameRooms[0][1].players.length, 4) // 5번째는 반영되지 않음
})

test('join_room_by_code: settings가 없는 구버전(랜덤 매칭) 방은 기존 매칭 정원으로 fallback한다', async () => {
    // 랜덤 매칭이 만들던 형태를 그대로 재현(settings 없음)
    matchmaking.__seedRoomForTests({
        id: 'legacy-room',
        code: 'LEGACY1',
        hostUuid: 'uuid-legacy-host',
        players: new Map([['uuid-legacy-host', { uuid: 'uuid-legacy-host', nickname: 'host' }]]),
    })

    const socket = createFakeSocket('uuid-legacy-join')
    const io = createFakeIo([socket])
    await handleJoinRoomByCode(io, socket, 'uuid-legacy-join', 'LEGACY1')

    assert.ok(socket.emitted.some((e) => e.event === 'room_joined'))
})

test('join_room_by_code: 동일 사용자의 join+join 동시 요청 중 하나만 성공한다', async () => {
    const hostSocket = createFakeSocket('uuid-host2')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host2', validSettingsPayload())
    const { roomCode } = created.room

    const joiner = createFakeSocket('uuid-joiner')
    io.sockets.sockets.set(joiner.id, joiner)

    await Promise.all([
        handleJoinRoomByCode(io, joiner, 'uuid-joiner', roomCode),
        handleJoinRoomByCode(io, joiner, 'uuid-joiner', roomCode),
    ])

    const joinedEvents = joiner.emitted.filter((e) => e.event === 'room_joined')
    assert.equal(joinedEvents.length, 1)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === created.room.roomId)
    assert.equal(room.players.length, 2) // host + joiner, 중복 커밋 없음
})

test('create_room과 join_room_by_code를 같은 사용자로 교차 실행해도 한 방에만 소속된다', async () => {
    // 지연 가능한 fake repository로 두 작업의 await 구간을 겹치게 만든다.
    const gate = deferred()
    fakeFindByUuid = async (uuid) => {
        await gate.promise
        return { nickname: `user-${uuid}` }
    }

    const hostSocket = createFakeSocket('uuid-host3')
    const io = createFakeIo([hostSocket])
    // 정원 확보를 위해 먼저 방을 하나 만들어둔다(다른 host로, 지연 없이).
    fakeFindByUuid = async (uuid) => ({ nickname: `user-${uuid}` })
    const preCreated = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host3', validSettingsPayload())
    const { roomCode } = preCreated.room

    // 이제부터 지연 걸기
    fakeFindByUuid = async (uuid) => {
        await gate.promise
        return { nickname: `user-${uuid}` }
    }

    const uuid = 'uuid-cross'
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)

    const createPromise = callAsPromise(handleCreateRoom, io, socket, uuid, validSettingsPayload())
    const joinPromise = handleJoinRoomByCode(io, socket, uuid, roomCode)

    gate.resolve() // 두 요청 모두 동시에 조회를 마치게 함
    const createResult = await createPromise
    await joinPromise

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const roomsContainingUuid = snapshot.gameRooms.filter(([, room]) => room.players.some(([pUuid]) => pUuid === uuid))
    assert.equal(roomsContainingUuid.length, 1) // 정확히 한 방에만 소속

    // pendingRoomTransitions 공유 잠금 덕분에 둘 중 하나만 실제로 반영됐어야 한다.
    if (createResult.ok) {
        assert.equal(roomsContainingUuid[0][0], createResult.room.roomId)
    }
})

// ── get_current_room ────────────────────────────────────────────────────

test('get_current_room: 참가 중인 방이 없으면 room:null을 반환한다', async () => {
    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-none')
    assert.deepEqual(res, { ok: true, room: null })
})

test('get_current_room: 실제 참가자면 방 정보를 반환한다', async () => {
    const socket = createFakeSocket('uuid-K')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-K', validSettingsPayload())

    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-K')
    assert.equal(res.ok, true)
    assert.equal(res.room.roomId, created.room.roomId)
})

test('get_current_room: 생성이 아직 처리 중이면 pending:true를 반환한다', async () => {
    const gate = deferred()
    fakeFindByUuid = () => gate.promise

    const socket = createFakeSocket('uuid-pending')
    const io = createFakeIo([socket])

    // await하지 않고 호출해 "처리 중" 상태를 만든다(콜백은 나중에 확인).
    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-pending', validSettingsPayload())

    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-pending')
    assert.deepEqual(res, { ok: true, room: null, pending: true })

    gate.resolve({ nickname: 'x' })
    await createPromise
})

test('get_current_room: playerRoom만 있고 실제 room.players에 없는 stale 매핑은 정리되고 null을 반환한다', async () => {
    matchmaking.__seedPlayerRoomForTests('uuid-stale', 'room-없음')
    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-stale')
    assert.deepEqual(res, { ok: true, room: null })

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.length, 0) // 정리됨
})

test('get_current_room: callback이 없는 요청은 상태를 바꾸지 않는다', () => {
    matchmaking.__seedPlayerRoomForTests('uuid-L', 'room-없음')
    const before = matchmaking.__getStateSnapshotForTests()
    handleGetCurrentRoom('uuid-L', undefined)
    const after = matchmaking.__getStateSnapshotForTests()
    assert.deepEqual(after, before) // stale 매핑 정리조차 일어나지 않음(부수효과 없음)
})

// ── 랜덤 매칭 비활성화 ────────────────────────────────────────────────────

test('join_matchmaking: 큐에 등록되지 않고 matchmaking_disabled를 응답한다', async () => {
    const socket = createFakeSocket('uuid-M')
    const io = createFakeIo([socket])

    await handleJoinMatchmaking(io, socket, 'uuid-M')

    assert.equal(socket.emitted.length, 1)
    assert.equal(socket.emitted[0].event, 'matchmaking_disabled')

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.matchmakingQueue.length, 0)
})

// ── 연결 종료 cleanup(기존 로직 재검증) ───────────────────────────────────

test('onDisconnect: 방장 혼자 있는 방에서 종료하면 방과 매핑이 삭제된다', async () => {
    const socket = createFakeSocket('uuid-solo')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-solo', validSettingsPayload())

    matchmaking.onDisconnect(io, socket, 'uuid-solo')
    // disconnect는 이제 즉시 제거가 아니라 재접속 유예 예약이다(새로고침 복구를 위해).
    // 재접속 확인 없이 유예가 끝난 경우를 재현해야 예전과 같은 정리 결과를 확인할 수 있다.
    matchmaking.__flushRoomRetentionForTests()

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('onDisconnect: 참가자가 있는 상태에서 방장이 종료하면 host_changed와 player_left_room이 발생한다', async () => {
    const hostSocket = createFakeSocket('uuid-host4')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-host4', validSettingsPayload())

    const joiner = createFakeSocket('uuid-joiner2')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-joiner2', created.room.roomCode)

    matchmaking.onDisconnect(io, hostSocket, 'uuid-host4')
    matchmaking.__flushRoomRetentionForTests() // 재접속 없이 유예 만료 → 실제 제거

    const hostChanged = io.broadcasts.find((b) => b.event === 'host_changed')
    const playerLeft = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.ok(hostChanged)
    assert.equal(hostChanged.payload.hostUuid, 'uuid-joiner2')
    assert.ok(playerLeft)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms[0][1].hostUuid, 'uuid-joiner2')
})

// ── onDisconnect ABA 방지 (socket.data.activeRoomId 결합) ───────────────────

test('onDisconnect(ABA): 방을 삭제하고 다른 Socket으로 새 Room을 만든 뒤 도착한 오래된 Socket의 지연 disconnect는 새 Room을 건드리지 않는다', async () => {
    const uuid = 'aba-mm-uuid'
    const staleSocket = createFakeSocket(uuid)
    const io = createFakeIo([staleSocket])
    await callAsPromise(handleCreateRoom, io, staleSocket, uuid, validSettingsPayload())

    const { handleDeleteRoom } = matchmaking.__testables
    handleDeleteRoom(io, uuid) // Room A 삭제 → playerRoom에서 uuid 제거됨

    const freshSocket = createFakeSocket(uuid, { id: 'sock-aba-mm-uuid-2' })
    io.sockets.sockets.set(freshSocket.id, freshSocket)
    const createdB = await callAsPromise(handleCreateRoom, io, freshSocket, uuid, validSettingsPayload())
    assert.equal(createdB.ok, true)

    io.broadcasts.length = 0
    // 오래된 staleSocket의 지연 disconnect가 뒤늦게 도착한다 — activeRoomId는 여전히
    // Room A를 가리키므로(생성 시점에 결합된 값), 현재 playerRoom(Room B)과 달라 무시된다.
    matchmaking.onDisconnect(io, staleSocket, uuid)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.ok(snapshot.gameRooms.some(([id]) => id === createdB.room.roomId), 'Room B가 그대로 남아있어야 한다')
    assert.equal(snapshot.playerRoom.some(([u, roomId]) => u === uuid && roomId === createdB.room.roomId), true)
    assert.equal(io.broadcasts.some((b) => b.event === 'player_left_room' || b.event === 'host_changed'), false)
})

test('onDisconnect(ABA): activeRoomId 결합이 없는 레거시 Socket의 disconnect는 기존처럼 현재 Room을 무조건 정리한다', async () => {
    const uuid = 'legacy-mm-uuid'
    matchmaking.__seedRoomForTests({
        id: 'legacy-room-aba',
        code: 'LEGACYABA',
        hostUuid: uuid,
        players: new Map([[uuid, { uuid, nickname: 'x', isReady: false }]]),
    })
    matchmaking.__seedPlayerRoomForTests(uuid, 'legacy-room-aba')
    const socketWithoutBinding = createFakeSocket(uuid) // activeRoomId를 한 번도 심어주지 않은 소켓
    const io = createFakeIo([socketWithoutBinding])

    matchmaking.onDisconnect(io, socketWithoutBinding, uuid)
    matchmaking.__flushRoomRetentionForTests() // 재접속 없이 유예 만료 → 실제 제거

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('onDisconnect(ABA): 오래된 Socket A의 지연 disconnect는 같은 uuid로 새로 큐에 등록된 Socket B의 항목을 지우지 않는다', async () => {
    const uuid = 'aba-queue-uuid'
    const staleSocket = createFakeSocket(uuid, { id: 'sock-aba-queue-old' })
    const io = createFakeIo([staleSocket])

    // Socket A가 큐에 등록한 상태를 흉내낸다.
    matchmaking.__seedMatchmakingQueueForTests(uuid, { uuid, nickname: 'x', socketId: staleSocket.id })

    // 같은 uuid가 다른 Socket B로 새로 큐에 등록된 뒤(예: 재접속), A의 disconnect가 뒤늦게 도착한다.
    matchmaking.__seedMatchmakingQueueForTests(uuid, { uuid, nickname: 'x', socketId: 'sock-aba-queue-new' })

    matchmaking.onDisconnect(io, staleSocket, uuid)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, queued] = snapshot.matchmakingQueue.find(([u]) => u === uuid) ?? []
    assert.ok(queued, 'Socket B의 큐 항목이 남아있어야 한다')
    assert.equal(queued.socketId, 'sock-aba-queue-new')
})

// ── P0: 생성 도중 연결 종료 ──────────────────────────────────────────────

test('create_room: 사용자 조회를 기다리는 동안 연결이 끊기면 방이 커밋되지 않는다', async () => {
    const gate = deferred()
    fakeFindByUuid = async (uuid) => { await gate.promise; return { nickname: `user-${uuid}` } }

    const socket = createFakeSocket('uuid-disc')
    const io = createFakeIo([socket])

    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-disc', validSettingsPayload())

    // 조회 대기 중 연결이 끊긴 상황을 흉내낸다. 이 시점에 실제 onDisconnect가 실행돼도
    // playerRoom에는 아직 아무것도 없어 정리할 게 없다고 판단하고 지나간다.
    socket.connected = false
    matchmaking.onDisconnect(io, socket, 'uuid-disc')

    gate.resolve({ nickname: 'x' }) // 조회가 뒤늦게 돌아옴
    const res = await createPromise

    assert.equal(res.ok, false)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
    assert.equal(snapshot.pendingRoomTransitions.length, 0) // 재시도 가능한 상태로 남아야 함
})

test('create_room: socket.join 대기 중 연결이 끊기면 Socket room을 정리하고 Map에 흔적을 남기지 않는다', async () => {
    const gate = deferred()
    const socket = createFakeSocket('uuid-disc2', { joinGate: gate.promise })
    const io = createFakeIo([socket])

    const createPromise = callAsPromise(handleCreateRoom, io, socket, 'uuid-disc2', validSettingsPayload())

    // 사용자 조회 + 계정 프로필 조회(F-13 AC-05, gate가 걸리지 않은 기본 fake들)가 끝나
    // "조회 후" 연결 확인을 통과하고 socket.join(joinGate)에서 막 대기를 시작한 시점까지
    // 기다린 뒤에 연결을 끊는다 — 정확한 microtask 틱 수 대신 join()이 실제로 호출된
    // 순간을 신호하는 socket.joinCalled를 기다린다(틱 수는 Promise.all 내부 구현에 따라
    // 달라질 수 있어 세는 방식은 깨지기 쉽다). 여기서 바로 connected=false를 주면 "조회 후"
    // 체크에서 먼저 걸려 join 자체가 호출되지 않으므로, join 이후 체크를 검증하려면 이
    // 순서가 필요하다.
    await socket.joinCalled
    socket.connected = false
    gate.resolve()
    const res = await createPromise

    assert.equal(res.ok, false)
    assert.equal(socket.left.length, 1) // join 이후 connected 재확인에서 걸려 leave됨
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
    assert.equal(snapshot.playerRoom.length, 0)
})

test('create_room: 성공 후 store 반영을 가정하는 room 객체는 재사용 가능한 형태를 유지한다(성공 콜백은 Map 커밋 이후에만 호출)', async () => {
    const socket = createFakeSocket('uuid-cb')
    const io = createFakeIo([socket])
    let callbackCallCount = 0
    const wrappedCallback = (res) => { callbackCallCount += 1; return res }

    const result = await new Promise((resolve) => {
        handleCreateRoom(io, socket, 'uuid-cb', validSettingsPayload(), (res) => {
            wrappedCallback(res)
            resolve(res)
        })
    })

    assert.equal(result.ok, true)
    assert.equal(callbackCallCount, 1) // 정상 경로에서 콜백이 정확히 한 번만 호출됨
})

// ── P1: 코드 참가 - 예상 못한 예외에서도 Socket room을 정리한다 ────────────

test('join_room_by_code: socket.join() 실패 시 방 상태가 변하지 않고 실패 응답을 보낸다', async () => {
    const hostSocket = createFakeSocket('uuid-jjhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-jjhost', validSettingsPayload())

    const joiner = createFakeSocket('uuid-jjoin', { joinShouldReject: true })
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-jjoin', created.room.roomCode)

    assert.match(joiner.emitted.at(-1).payload.message, /참여하지 못했습니다/)
    const after = matchmaking.__getStateSnapshotForTests()
    const [, room] = after.gameRooms.find(([id]) => id === created.room.roomId)
    assert.equal(room.players.length, 1) // 새 참가자는 반영되지 않음
    assert.equal(after.pendingRoomTransitions.length, 0)
})

test('join_room_by_code: join 이후 커밋 전 예상 못한 예외가 나면 Socket room에서도 나간다', async () => {
    const io = createFakeIo([])
    const roomId = 'room-exc'
    const roomCode = 'EXC123'
    // "join은 성공했지만 정원 검사(커밋 전) 단계에서 예상 못한 예외가 발생하는" 상황을 흉내낸다.
    // 그 정원 검사가 읽는 값은 room.settings.maxPlayers 하나이므로(handleJoinRoomByCode의
    // `room.settings?.maxPlayers ?? ...`), 바로 그 속성 접근만 던지게 한다 — 예외가 주입되는
    // 지점은 예전(모든 접근에서 throw)과 **동일한 그 줄**이고, join 이후·커밋 이전이라는
    // 조건도 그대로다.
    //
    // 모든 접근에서 던지지 않는 이유: F-20에서 __getStateSnapshotForTests가 settings를 깊게
    // 복사하게 됐다(스냅샷이 라이브 참조를 가리키면 "저장 전후가 같다"는 무변경 단언이 같은
    // 객체를 비교하며 항상 통과해 버리므로). 모든 접근이 던지면 아래 롤백 단언이 스냅샷을
    // 읽는 순간 주입한 예외가 되살아나, 정작 검증하려던 롤백 결과를 볼 수 없다. 주입을
    // 없애거나 깊은 복사를 되돌리는 대신 주입 범위를 실제 실패 지점으로 좁힌다.
    const brokenSettings = new Proxy({}, {
        get(target, prop, receiver) {
            if (prop === 'maxPlayers') throw new Error('설정 조회 실패(테스트 주입)')
            return Reflect.get(target, prop, receiver)
        },
    })
    matchmaking.__seedRoomForTests({
        id: roomId,
        code: roomCode,
        hostUuid: 'uuid-exchost',
        players: new Map([['uuid-exchost', { uuid: 'uuid-exchost', nickname: 'host' }]]),
        settings: brokenSettings,
    })

    const joiner = createFakeSocket('uuid-excjoin')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-excjoin', roomCode)

    const failed = joiner.emitted.find((e) => e.event === 'room_join_failed')
    assert.match(failed.payload.message, /참여하지 못했습니다/)
    // 주입한 예외가 정말 "예상 못한 예외" 경로로 떨어졌는지 고정한다 — 이 단언이 없으면
    // 주입이 언젠가 발동하지 않게 돼도 ROOM_FULL 같은 **정상** 거부로 조용히 통과한다.
    assert.equal(failed.payload.code, ROOM_JOIN_ERROR_CODES.INTERNAL_ERROR)
    assert.equal(joiner.left.length, 1) // join 후 커밋 전 예외 → Socket room에서 정리됨
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 1) // 새 참가자는 반영되지 않음
    // 두 Map 중 한쪽만 되돌아가는 일이 없어야 한다(역방향 소속도 커밋되지 않았다).
    assert.equal(snapshot.playerRoom.some(([u]) => u === 'uuid-excjoin'), false)
})

// ── P1: 정원 레이스 — 실제 동시 참가 시나리오 ───────────────────────────────

test('join_room_by_code: 마지막 한 자리에 서로 다른 두 사용자가 동시 참가해도 정원을 넘기지 않는다', async () => {
    const hostSocket = createFakeSocket('uuid-lasthost')
    const io = createFakeIo([hostSocket])
    // maxPlayers는 검증기가 UI와 동일하게 4~10만 허용하므로 정원 4로 만들고 2명을 먼저
    // 채워 남은 자리를 1개로 좁힌다(host + pre1 + pre2 = 3명, 정원 4).
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-lasthost', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 })
    )
    const { roomCode, roomId } = created.room

    for (const uuid of ['uuid-pre1', 'uuid-pre2']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }

    const gateA = deferred()
    const gateB = deferred()
    const socketA = createFakeSocket('uuid-raceA', { joinGate: gateA.promise })
    const socketB = createFakeSocket('uuid-raceB', { joinGate: gateB.promise })
    io.sockets.sockets.set(socketA.id, socketA)
    io.sockets.sockets.set(socketB.id, socketB)

    const joinA = handleJoinRoomByCode(io, socketA, 'uuid-raceA', roomCode)
    const joinB = handleJoinRoomByCode(io, socketB, 'uuid-raceB', roomCode)

    // 둘 다 socket.join 대기 상태에 들어간 뒤 동시에 풀어준다.
    gateA.resolve()
    gateB.resolve()
    await Promise.all([joinA, joinB])

    const succeeded = [socketA, socketB].filter((s) => s.emitted.some((e) => e.event === 'room_joined'))
    const failed = [socketA, socketB].filter((s) => s.emitted.some((e) => e.event === 'room_join_failed'))
    assert.equal(succeeded.length, 1)
    assert.equal(failed.length, 1)
    assert.match(failed[0].emitted.find((e) => e.event === 'room_join_failed').payload.message, /가득 찼습니다/)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 4) // 정원 초과 없음
})

test('join_room_by_code: join 대기 중 다른 참가자가 먼저 마지막 자리를 채우면 정원 초과로 거부된다', async () => {
    const hostSocket = createFakeSocket('uuid-fillhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-fillhost', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 })
    )
    const { roomCode, roomId } = created.room

    for (const uuid of ['uuid-pre3', 'uuid-pre4']) {
        const s = createFakeSocket(uuid)
        io.sockets.sockets.set(s.id, s)
        await handleJoinRoomByCode(io, s, uuid, roomCode)
    }
    // host + pre3 + pre4 = 3명, 남은 자리 1개

    const gate = deferred()
    const laggingJoiner = createFakeSocket('uuid-lag', { joinGate: gate.promise })
    io.sockets.sockets.set(laggingJoiner.id, laggingJoiner)
    const joinPromise = handleJoinRoomByCode(io, laggingJoiner, 'uuid-lag', roomCode)

    // laggingJoiner가 socket.join 대기 중인 사이 다른 사용자가 먼저 마지막 자리를 채운다.
    const fastJoiner = createFakeSocket('uuid-fast')
    io.sockets.sockets.set(fastJoiner.id, fastJoiner)
    await handleJoinRoomByCode(io, fastJoiner, 'uuid-fast', roomCode)

    gate.resolve()
    await joinPromise

    assert.match(laggingJoiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /가득 찼습니다/)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === roomId)
    assert.equal(room.players.length, 4)
    assert.equal(laggingJoiner.left.length, 1) // join은 됐지만 정원 초과로 leave까지 마쳐야 함
})

test('join_room_by_code: join 대기 중 방이 삭제되면 참가를 거부하고 Socket room에서 나간다', async () => {
    const hostSocket = createFakeSocket('uuid-delhost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-delhost', validSettingsPayload())
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-deljoin', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const joinPromise = handleJoinRoomByCode(io, joiner, 'uuid-deljoin', roomCode)

    // handleJoinRoomByCode가 사용자 조회 + 계정 프로필 조회(F-13 AC-05)를 마치고 방을
    // code로 찾은 뒤 socket.join(joinGate) 대기에 들어갈 때까지 기다린다(정확한 tick 수
    // 대신 join() 호출 자체를 신호하는 socket.joinCalled를 쓴다 — 위 create_room 테스트와
    // 같은 이유). 여기서 바로 방을 지우면 아직 방 조회 자체가 실행되기 전이라 "방 삭제 후
    // join" 상황이 아니라 "애초에 없던 방" 상황이 돼버린다.
    await joiner.joinCalled
    // join이 대기하는 동안 방장이 방을 삭제한 상황을 흉내낸다.
    matchmaking.__removeRoomForTests(roomId)
    gate.resolve()
    await joinPromise

    assert.match(joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /찾을 수 없습니다/)
    assert.equal(joiner.left.length, 1)
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.length, 0)
})

test('join_room_by_code: join 대기 중 같은 id의 다른 Room 객체로 교체되면 참가를 거부한다', async () => {
    const hostSocket = createFakeSocket('uuid-swaphost')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-swaphost', validSettingsPayload())
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-swapjoin', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const joinPromise = handleJoinRoomByCode(io, joiner, 'uuid-swapjoin', roomCode)

    // 방 조회가 끝나고 socket.join(joinGate) 대기에 들어갈 때까지 기다린다(위와 동일한 이유).
    await joiner.joinCalled
    // join이 대기하는 동안 같은 roomId를 가진 "다른" 객체로 바꿔치기한다(참조 동등성 깨짐).
    matchmaking.__seedRoomForTests({
        id: roomId,
        code: roomCode,
        hostUuid: 'uuid-swaphost',
        players: new Map([['uuid-swaphost', { uuid: 'uuid-swaphost', nickname: 'host' }]]),
        settings: validSettingsPayload(),
    })
    gate.resolve()
    await joinPromise

    assert.match(joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /찾을 수 없습니다/)
    assert.equal(joiner.left.length, 1)
})

// ---------------------------------------------------------------------------
// F-23(AC-04) — 코드 참가의 join → 재검사 → 커밋 구간은 수신 자격이 아니다
//
// handleJoinRoomByCode는 socket.join을 **먼저** 끝내고 그 뒤에 방 인스턴스·정원·소속·전이
// 세대를 다시 검사한다. 그 구간(과 거부된 뒤 채널을 떼는 구간)의 소켓은 아직/끝내 참가자가
// 아닌데, 예전에는 아무 제외도 없어 그 방의 방송을 그대로 받았다.
// ---------------------------------------------------------------------------

const channelMembership = require('../channelMembership')

/** 이 소켓이 실제로 받은(방송 포함) 그 이벤트의 건수 — 방송 **시도** 기록과 구분된다. */
function receivedCount(socket, event) {
    return socket.received.filter((entry) => entry.event === event).length
}

/**
 * 방 채널 방송을 **프로덕션 경계 그대로** 낸다.
 *
 * 시험이 io.to(room).emit을 직접 부르면 그것은 어떤 제외도 지나지 않는 원시 방송이라
 * "제외가 동작하는가"를 전혀 검사하지 못한다 — 모든 방 방송이 실제로 지나는 그 함수를 쓴다.
 */
function broadcastThroughProductionBoundary(io, roomId, event, payload = {}) {
    channelMembership.emitToChannel(io, roomId, event, payload)
}

test('F-23(AC-04): join 뒤 재검사에서 거부된 입장자는 채널을 떼지 못해도 그 방의 방송을 받지 않는다', async (t) => {
    t.after(() => channelMembership.__resetChannelExclusionsForTests())

    const hostSocket = createFakeSocket('uuid-jbc-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-jbc-host', validSettingsPayload(),
    )
    const { roomCode, roomId } = created.room

    const gate = deferred()
    const joiner = createFakeSocket('uuid-jbc-reject', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const joinPromise = handleJoinRoomByCode(io, joiner, 'uuid-jbc-reject', roomCode)

    await joiner.joinCalled
    /**
     * **채널에서 떼는 일을 붙잡아 둔다.**
     *
     * 실제 adapter의 leave는 비동기다. 거부 판정 직후 그 완료 전까지 이 소켓은 여전히 채널에
     * 남아 있고, 그 구간이 바로 "참가자가 아닌 연결이 방 상태를 구독하는" 자리다. 여기서는
     * leave를 영영 끝내지 않아 그 최악의 구간을 고정한다.
     */
    joiner.leave = () => new Promise(() => {})
    // join이 대기하는 동안 방장이 방을 삭제한다 — join 완료 뒤 재검사가 이 입장을 거부한다.
    matchmaking.__removeRoomForTests(roomId)
    gate.resolve()
    await joinPromise

    assert.match(
        joiner.emitted.find((e) => e.event === 'room_join_failed').payload.message, /찾을 수 없습니다/,
    )
    assert.equal(joiner.rooms.has(roomId), true, '전제: leave가 끝나지 않아 채널에 남아 있다')

    broadcastThroughProductionBoundary(io, roomId, 'probe_after_reject')
    assert.equal(
        receivedCount(joiner, 'probe_after_reject'), 0,
        '거부된 입장자가 그 방의 방송을 받았다',
    )
    // 양성 대조 — 정상 참가자(방장)는 같은 방송을 실제로 받는다.
    assert.equal(
        receivedCount(hostSocket, 'probe_after_reject'), 1,
        '정상 참가자가 방송을 받지 못했다',
    )
})

test('F-23(AC-04): 거부됐던 소켓의 다음 정상 입장은 방송을 정상 수신한다(옛 토큰이 남지 않는다)', async (t) => {
    t.after(() => channelMembership.__resetChannelExclusionsForTests())

    const hostSocket = createFakeSocket('uuid-jbc2-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-jbc2-host', validSettingsPayload(),
    )
    const { roomCode, roomId } = created.room

    // ① 정원을 넘겨 한 번 거부당한다(방은 그대로 남는다).
    const gate = deferred()
    const joiner = createFakeSocket('uuid-jbc2-join', { joinGate: gate.promise })
    io.sockets.sockets.set(joiner.id, joiner)
    const rejected = handleJoinRoomByCode(io, joiner, 'uuid-jbc2-join', roomCode)
    await joiner.joinCalled
    matchmaking.__removeRoomForTests(roomId)
    gate.resolve()
    await rejected

    // ② 같은 코드의 방을 다시 만들고 정상 입장한다.
    const recreated = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-jbc2-host', validSettingsPayload(),
    )
    await handleJoinRoomByCode(io, joiner, 'uuid-jbc2-join', recreated.room.roomCode)

    broadcastThroughProductionBoundary(io, recreated.room.roomId, 'probe_after_rejoin')
    assert.equal(
        receivedCount(joiner, 'probe_after_rejoin'), 1,
        '폐기된 옛 제외 토큰이 남아 새 정상 소속이 방송을 받지 못한다',
    )
})

test('F-23(AC-04): 전달에서 제외된 소켓은 확정 참가자의 소켓이어도 game_started를 받지 않는다', async (t) => {
    t.after(() => channelMembership.__resetChannelExclusionsForTests())

    const hostSocket = createFakeSocket('uuid-excl-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(
        io, 'uuid-excl-host', 'uuid-excl-joiner', readyRoomHandlers,
    )

    // 같은 계정의 **떼지 못한 옛 소켓**이 채널에 남아 자기 토큰으로 제외돼 있는 상태를 만든다.
    const staleSocket = createFakeSocket('uuid-excl-joiner', { id: 'sock-uuid-excl-joiner-stale' })
    staleSocket.rooms.add(room.roomId)
    io.sockets.sockets.set(staleSocket.id, staleSocket)
    channelMembership.excludeSocketFromChannel(room.roomId, staleSocket.id, 'stale-detach')

    const { getResponse, callback } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-excl-host', startPayload(room), callback)

    assert.equal(getResponse().ok, true)
    assert.equal(
        staleSocket.emitted.filter((e) => e.event === 'game_started').length, 0,
        '전달에서 제외된 소켓이 game_started를 받았다',
    )
    // 양성 대조 — 제외되지 않은 정상 소켓은 그대로 받는다.
    assert.equal(joinerSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
})

// ── leaveSocketRoomSafely: leave의 다양한 반환/예외 형태를 모두 흡수한다 ────

test('leaveSocketRoomSafely: leave가 undefined/resolved Promise/동기 예외/reject 무엇을 반환해도 예외를 던지지 않는다', async () => {
    const cases = [
        () => undefined,
        () => Promise.resolve(),
        () => { throw new Error('동기 예외') },
        () => Promise.reject(new Error('비동기 reject')),
    ]
    for (const leave of cases) {
        const fakeSocket = { leave }
        await assert.doesNotReject(() => leaveSocketRoomSafely(fakeSocket, 'room-x', '[테스트]'))
    }
})

// ── 공개방 회귀 테스트: Room 교체 경쟁 조건 ─────────────────────────────────
// 이 테스트는 수정 전 코드에서 먼저 실행해 실패(버그 재현)를 확인한 뒤, 최소 수정을
// 적용하고 다시 실행해 통과를 확인하는 용도다. 결과는 최종 보고에 그대로 남긴다.

test('공개방 입장: 선택한 open 방(A)이 대기 중 삭제되고 같은 코드의 code 방(B)이 생기면 참가가 거부되고 B에 반영되지 않는다', async () => {
    const hostASocket = createFakeSocket('uuid-raceAhost')
    const io = createFakeIo([hostASocket])
    const createdA = await callAsPromise(handleCreateRoom, io, hostASocket, 'uuid-raceAhost', validSettingsPayload())
    const roomAId = createdA.room.roomId
    const roomACode = createdA.room.roomCode

    // 사용자 조회를 지연시켜, 그 사이 A 삭제 + B(같은 코드) 생성을 끼워 넣을 수 있게 한다.
    const gate = deferred()
    fakeFindByUuid = async (uuid) => { await gate.promise; return { nickname: `user-${uuid}` } }

    const joinerSocket = createFakeSocket('uuid-racejoiner')
    io.sockets.sockets.set(joinerSocket.id, joinerSocket)
    const joinPromise = handleJoinPublicRoom(io, joinerSocket, 'uuid-racejoiner', { roomId: roomAId })

    // handleJoinPublicRoom → handleJoinRoomByCode가 findByUuid 대기 지점까지 진행되도록 한 tick 양보한다.
    await Promise.resolve()

    // 대기 중 A를 지우고, 같은 roomCode를 가진 code 방 B를 새로 만든다.
    matchmaking.__removeRoomForTests(roomAId)
    matchmaking.__seedRoomForTests({
        id: 'room-B',
        code: roomACode,
        hostUuid: 'uuid-hostB',
        title: 'B',
        accessType: 'code',
        players: new Map([['uuid-hostB', { uuid: 'uuid-hostB', nickname: 'hostB' }]]),
        settings: {
            maxPlayers: 8, jokerCount: 2, lightsOut: false, soulBetting: false,
            dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90, voteReveal: true,
        },
    })

    gate.resolve({ nickname: 'user-uuid-racejoiner' })
    await joinPromise

    // 요청은 실패해야 한다.
    const failedEvent = joinerSocket.emitted.find((e) => e.event === 'room_join_failed')
    assert.ok(failedEvent, '참가가 거부되어야 하는데 실패 이벤트가 없습니다')

    // B의 players/playerRoom에 참가자가 반영되면 안 된다.
    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, roomB] = snapshot.gameRooms.find(([id]) => id === 'room-B')
    assert.ok(roomB)
    assert.equal(roomB.players.some(([pUuid]) => pUuid === 'uuid-racejoiner'), false)
    assert.equal(snapshot.playerRoom.some(([pUuid]) => pUuid === 'uuid-racejoiner'), false)

    // 사용자가 B의 Socket room에 최종적으로 남아있으면 안 된다.
    assert.equal(joinerSocket.currentRooms.has('room-B'), false)
})

// ── set_ready: 준비 상태 데이터 모델과 멱등 계약 ────────────────────────────

test('set_ready: 새로 생성/참가한 플레이어는 기본적으로 준비 안 됨 상태다', async () => {
    const hostSocket = createFakeSocket('uuid-ready-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-host', validSettingsPayload())
    assert.equal(created.room.players[0].isReady, false)

    const joiner = createFakeSocket('uuid-ready-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-joiner', created.room.roomCode)
    const joinedPayload = joiner.emitted.find((e) => e.event === 'room_joined').payload
    const joinerEntry = joinedPayload.players.find((p) => p.uuid === 'uuid-ready-joiner')
    assert.equal(joinerEntry.isReady, false)
})

test('set_ready: 동일한 목표 상태로 두 번 요청해도 결과가 같고 두 번째 요청은 방송하지 않는다', async () => {
    const socket = createFakeSocket('uuid-ready-idem')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-idem', validSettingsPayload())

    const res1 = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-idem', readyPayload(created.room))
    assert.equal(res1.ok, true)
    assert.equal(res1.isReady, true)
    assert.equal(socket.emitted.filter((e) => e.event === 'player_ready_changed').length, 1)

    const res2 = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-idem', readyPayload(created.room))
    assert.equal(res2.ok, true)
    assert.equal(res2.isReady, true)
    // 값이 이미 같으므로 두 번째 요청에서는 방송이 추가로 발생하지 않는다(멱등성).
    assert.equal(socket.emitted.filter((e) => e.event === 'player_ready_changed').length, 1)
})

test('set_ready: isReady가 boolean이 아니면 상태 변경 없이 거부한다', async () => {
    const socket = createFakeSocket('uuid-ready-badtype')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-badtype', validSettingsPayload())

    for (const badValue of ['true', 1, null, undefined, {}, []]) {
        // 방·버전은 정상으로 두고 isReady만 잘못된 값으로 덮는다 — 거부 사유가 isReady의
        // 형태임을 분명히 하기 위함이다(readyPayload의 기본값이 끼어들지 않게 직접 얹는다).
        const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-badtype',
            { ...readyPayload(created.room), isReady: badValue })
        assert.equal(res.ok, false)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-badtype')
    assert.equal(player.isReady, false) // 잘못된 형식의 요청은 어느 것도 반영되지 않는다
})

test('set_ready: payload 자체가 null·문자열·배열이면 구조분해 예외 없이 명시적으로 거부한다', async () => {
    const socket = createFakeSocket('uuid-ready-badpayload')
    const io = createFakeIo([socket])
    await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-badpayload', validSettingsPayload())

    for (const badPayload of [null, 'not-an-object', ['isReady', true]]) {
        const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-badpayload', badPayload)
        assert.equal(res.ok, false)
    }

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-badpayload')
    assert.equal(player.isReady, false)
})

test('set_ready: payload에 다른 uuid를 넣어도 무시되고 요청자(인증된 uuid) 본인만 바뀐다', async () => {
    const hostSocket = createFakeSocket('uuid-ready-self-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-self-host', validSettingsPayload())

    const joiner = createFakeSocket('uuid-ready-self-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-self-joiner', created.room.roomCode)

    // hostSocket으로 요청하면서 payload에는 joiner의 uuid를 흉내낸 값을 함께 보낸다.
    const res = await callAsPromise(
        handleSetReady, io, hostSocket, 'uuid-ready-self-host',
        { ...readyPayload(created.room), uuid: 'uuid-ready-self-joiner' },
    )
    assert.equal(res.ok, true)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms.find(([id]) => id === created.room.roomId)
    const [, hostPlayer] = room.players.find(([uuid]) => uuid === 'uuid-ready-self-host')
    const [, joinerPlayer] = room.players.find(([uuid]) => uuid === 'uuid-ready-self-joiner')
    assert.equal(hostPlayer.isReady, true) // 실제 인증된 요청자만 변경됨
    assert.equal(joinerPlayer.isReady, false) // payload의 uuid는 애초에 읽히지 않음
})

test('set_ready: 방에 참여하지 않은 사용자의 요청은 거부된다', async () => {
    const io = createFakeIo([])
    const socket = createFakeSocket('uuid-ready-outside')
    const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-outside', {
        isReady: true, roomId: 'room-not-joined', expectedSettingsVersion: 1,
    })
    assert.equal(res.ok, false)
    assert.match(res.message, /참여 중인 방이 없습니다/)
})

test('set_ready: 방이 이미 삭제된 뒤 도착한 요청은 안전하게 실패한다', async () => {
    const socket = createFakeSocket('uuid-ready-deleted')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-deleted', validSettingsPayload())
    matchmaking.__removeRoomForTests(created.room.roomId)

    const res = await callAsPromise(handleSetReady, io, socket, 'uuid-ready-deleted', readyPayload(created.room))
    assert.equal(res.ok, false)
})

test('set_ready: callback이 없는 요청은 실제 Room·참가자가 있어도 isReady/canStart/Map 무엇도 바꾸지 않는다', async () => {
    const socket = createFakeSocket('uuid-ready-nocb')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-ready-nocb', validSettingsPayload())

    const before = matchmaking.__getStateSnapshotForTests()
    handleSetReady(io, socket, 'uuid-ready-nocb', readyPayload(created.room), undefined)
    const after = matchmaking.__getStateSnapshotForTests()

    assert.deepEqual(after, before)
    const [, room] = after.gameRooms.find(([id]) => id === created.room.roomId)
    const [, player] = room.players.find(([uuid]) => uuid === 'uuid-ready-nocb')
    assert.equal(player.isReady, false) // 콜백이 없어 검증 이전 단계에서 그대로 반환되어야 한다
    assert.equal(created.room.canStart, false)
})

test('set_ready: 요청자는 ack만 받고, 같은 방의 다른 참가자는 player_ready_changed만 받는다(요청자 자신은 받지 않음)', async () => {
    // 공용 createFakeSocket의 socket.to(room).emit()은 broadcastTo 태그만 요청자 자신의
    // emitted 목록에 남기고 실제로 다른 fake socket에 전달하지 않는다(다른 테스트들은 그것으로
    // 충분했다). 이번엔 "다른 참가자가 실제로 수신하는지"를 검증해야 하므로, 이 테스트에서만
    // join된 다른 소켓에 실제로 전달하는 socket.to()로 국소적으로 교체한다.
    const registry = new Map()
    function makeDeliveringSocket(uuid) {
        const s = createFakeSocket(uuid)
        s.to = (roomId) => ({
            emit(event, payload) {
                for (const other of registry.values()) {
                    if (other === s) continue
                    if (other.currentRooms.has(roomId)) other.emitted.push({ event, payload })
                }
            },
        })
        registry.set(uuid, s)
        return s
    }

    const hostSocket = makeDeliveringSocket('uuid-ready-recv-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-ready-recv-host', validSettingsPayload())

    const joiner = makeDeliveringSocket('uuid-ready-recv-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-ready-recv-joiner', created.room.roomCode)

    hostSocket.emitted.length = 0 // room_joined 등 이전 이벤트는 이번 검증과 무관하므로 비운다
    joiner.emitted.length = 0

    const ack = await callAsPromise(handleSetReady, io, hostSocket, 'uuid-ready-recv-host', readyPayload(created.room))
    assert.equal(ack.ok, true)

    // 요청자(host) 자신은 player_ready_changed를 받지 않는다 — ack로만 결과를 안다.
    assert.equal(hostSocket.emitted.some((e) => e.event === 'player_ready_changed'), false)

    // 같은 방의 다른 참가자(joiner)는 player_ready_changed를 실제로 받는다.
    const received = joiner.emitted.find((e) => e.event === 'player_ready_changed')
    assert.ok(received)
    assert.equal(received.payload.uuid, 'uuid-ready-recv-host')
    assert.equal(received.payload.isReady, true)
})

// ── canStart: 참가/퇴장/방장변경 시 즉시 재계산 ─────────────────────────────

// jokerCount는 최소 1만 허용되므로(ALLOWED_JOKER_COUNT), "비-광대 최소 1명"을 항상 만족하려면
// 아래 canStart 테스트들은 인원을 2명 이상으로 유지한다(1명뿐이면 players.length(1) <= jokerCount(1)
// 이 되어 준비 여부와 무관하게 항상 canStart가 false로 계산되기 때문).

test('canStart: 전원 준비된 방에 새 참가자가 들어오면(기본 미준비) canStart가 다시 false로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-a-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-a-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-a-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-a-joinerA', created.room.roomCode)

    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-canstart-a-host', readyPayload(created.room))
    const joinerAReady = await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-a-joinerA', readyPayload(created.room))
    assert.equal(joinerAReady.canStart, true) // host+joinerA 2명 모두 준비 완료 → 시작 가능

    const joinerB = createFakeSocket('uuid-canstart-a-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-a-joinerB', created.room.roomCode)

    const joinedBroadcast = joinerB.emitted.find((e) => e.event === 'player_joined_room')
    assert.equal(joinedBroadcast.payload.canStart, false) // 새 참가자는 기본 미준비라 다시 false
})

test('canStart: 미준비 참가자가 나가면 canStart가 다시 true로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-b-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-b-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-b-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-b-joinerA', created.room.roomCode)
    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-canstart-b-host', readyPayload(created.room))
    await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-b-joinerA', readyPayload(created.room))
    // 여기까지 host+joinerA 모두 준비 완료 → canStart는 true인 상태다.

    const joinerB = createFakeSocket('uuid-canstart-b-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-b-joinerB', created.room.roomCode)
    // joinerB는 미준비 상태로 참가해 canStart를 다시 false로 만든다.

    matchmaking.onDisconnect(io, joinerB, 'uuid-canstart-b-joinerB')
    matchmaking.__flushRoomRetentionForTests() // 재접속 없이 유예 만료 → 실제 제거

    const leftBroadcast = io.broadcasts.find((b) => b.event === 'player_left_room')
    assert.ok(leftBroadcast)
    assert.equal(leftBroadcast.payload.canStart, true) // 미준비였던 joinerB가 나가 다시 host+joinerA만 남음
})

test('canStart: 방장이 종료로 바뀌어도 남은 참가자의 준비 상태는 유지되고 canStart가 새 구성 기준으로 재계산된다', async () => {
    const hostSocket = createFakeSocket('uuid-canstart-c-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-canstart-c-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joinerA = createFakeSocket('uuid-canstart-c-joinerA')
    io.sockets.sockets.set(joinerA.id, joinerA)
    await handleJoinRoomByCode(io, joinerA, 'uuid-canstart-c-joinerA', created.room.roomCode)
    const joinerB = createFakeSocket('uuid-canstart-c-joinerB')
    io.sockets.sockets.set(joinerB.id, joinerB)
    await handleJoinRoomByCode(io, joinerB, 'uuid-canstart-c-joinerB', created.room.roomCode)

    // 곧 새 방장이 될 joinerA와 나머지 joinerB를 준비 완료 상태로 만든다.
    // 곧 사라질 host는 미준비 상태로 둔다(방장 변경과 준비 상태가 무관함을 함께 확인).
    await callAsPromise(handleSetReady, io, joinerA, 'uuid-canstart-c-joinerA', readyPayload(created.room))
    await callAsPromise(handleSetReady, io, joinerB, 'uuid-canstart-c-joinerB', readyPayload(created.room))

    matchmaking.onDisconnect(io, hostSocket, 'uuid-canstart-c-host') // 방장 종료 → joinerA가 새 방장
    matchmaking.__flushRoomRetentionForTests() // 재접속 없이 유예 만료 → 실제 제거

    const hostChanged = io.broadcasts.find((b) => b.event === 'host_changed')
    assert.ok(hostChanged)
    assert.equal(hostChanged.payload.hostUuid, 'uuid-canstart-c-joinerA')
    assert.equal(hostChanged.payload.canStart, true) // 남은 joinerA+joinerB 모두 준비 완료 상태 그대로 유지되어 충족

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = snapshot.gameRooms[0]
    const [, joinerAPlayer] = room.players.find(([uuid]) => uuid === 'uuid-canstart-c-joinerA')
    assert.equal(joinerAPlayer.isReady, true) // 방장 변경으로 준비 상태가 초기화되지 않는다
})

// ── start_game: 게임 시작 가드(ack 계약, 성공 처리는 다음 슬라이스) ────────

test('start_game: 참여 중인 방이 없으면 ROOM_NOT_FOUND로 ack가 정확히 한 번 온다', async () => {
    const socket = createFakeSocket('uuid-start-noroom')
    const io = createFakeIo([socket])
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()

    await handleStartGame(io, socket, 'uuid-start-noroom',
        { roomId: 'room-not-joined', expectedSettingsVersion: 1 }, callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'ROOM_NOT_FOUND')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 방이 이미 삭제된 상태에서의 요청은 ROOM_NOT_FOUND로 안전하게 실패한다', async () => {
    const socket = createFakeSocket('uuid-start-deleted')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-start-deleted', validSettingsPayload())
    matchmaking.__removeRoomForTests(created.room.roomId)

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const res = await callAsPromise(handleStartGame, io, socket, 'uuid-start-deleted', startPayload(created.room))
    assert.equal(res.ok, false)
    assert.equal(res.code, 'ROOM_NOT_FOUND')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 방장이 아닌 사용자의 요청은 NOT_HOST로 ack가 정확히 한 번 온다', async () => {
    const hostSocket = createFakeSocket('uuid-start-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-start-host', validSettingsPayload())

    const joiner = createFakeSocket('uuid-start-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-start-joiner', created.room.roomCode)

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, joiner, 'uuid-start-joiner', startPayload(created.room), callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'NOT_HOST')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 운영 최소 인원 기준으로 인원이 미달이면 MIN_PLAYERS_NOT_MET으로 ack가 정확히 한 번 온다', async () => {
    const originalMin = process.env.GAME_DEV_MIN_PLAYERS
    process.env.GAME_DEV_MIN_PLAYERS = '2' // 개발 환경 기본값(1명)로는 항상 충족되므로 임시로 올린다
    try {
        const hostSocket = createFakeSocket('uuid-start-min')
        const io = createFakeIo([hostSocket])
        const created = await callAsPromise(
            handleCreateRoom, io, hostSocket, 'uuid-start-min', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
        )
        const beforeSession = gameSession.__getStateSnapshotForTests()
        const { callback, getCalls, getResponse } = countingCallback()
        await handleStartGame(io, hostSocket, 'uuid-start-min', startPayload(created.room), callback)

        assert.equal(getCalls(), 1)
        assert.equal(getResponse().ok, false)
        assert.equal(getResponse().code, 'MIN_PLAYERS_NOT_MET')
        assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    } finally {
        if (originalMin === undefined) delete process.env.GAME_DEV_MIN_PLAYERS
        else process.env.GAME_DEV_MIN_PLAYERS = originalMin
    }
})

test('start_game: 실제 참가 인원이 광대 수 이하이면(비-광대 0명) MIN_PLAYERS_NOT_MET으로 거부된다', async () => {
    const hostSocket = createFakeSocket('uuid-start-joker')
    const io = createFakeIo([hostSocket])
    // maxPlayers=4, jokerCount=1로 생성한 뒤 host 1명만 있는 상태(참가 인원 1 <= jokerCount 1)를 재현한다.
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-start-joker', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const res = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-start-joker', startPayload(created.room))
    assert.equal(res.ok, false)
    assert.equal(res.code, 'MIN_PLAYERS_NOT_MET')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 정원(4)이 운영 최소 인원(5)보다 작아도 정원만큼 채우고 전원 준비하면 인원 조건을 통과한다', async () => {
    const originalMin = process.env.GAME_DEV_MIN_PLAYERS
    process.env.GAME_DEV_MIN_PLAYERS = '5'
    try {
        const hostSocket = createFakeSocket('uuid-cap-host')
        const io = createFakeIo([hostSocket])
        const created = await callAsPromise(
            handleCreateRoom, io, hostSocket, 'uuid-cap-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
        )
        const { roomCode } = created.room

        const sockets = { 'uuid-cap-host': hostSocket }
        for (const uuid of ['uuid-cap-p1', 'uuid-cap-p2', 'uuid-cap-p3']) {
            const s = createFakeSocket(uuid)
            io.sockets.sockets.set(s.id, s)
            await handleJoinRoomByCode(io, s, uuid, roomCode)
            sockets[uuid] = s
        }
        // host + 3명 = 정원 4명, 운영 최소 인원(5)에는 못 미치지만 정원 기준으로는 충족해야 한다.

        for (const [uuid, s] of Object.entries(sockets)) {
            await callAsPromise(handleSetReady, io, s, uuid, readyPayload(created.room))
        }

        const res = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-cap-host', startPayload(created.room))
        assert.equal(res.ok, true) // 인원 미달로 막히지 않고 GameSession 전환까지 성공한다
    } finally {
        if (originalMin === undefined) delete process.env.GAME_DEV_MIN_PLAYERS
        else process.env.GAME_DEV_MIN_PLAYERS = originalMin
    }
})

test('start_game: 준비하지 않은 참가자가 있으면 PLAYERS_NOT_READY로 ack가 정확히 한 번 온다', async () => {
    const hostSocket = createFakeSocket('uuid-start-notready-host')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'uuid-start-notready-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    const joiner = createFakeSocket('uuid-start-notready-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-start-notready-joiner', created.room.roomCode)

    // 호스트만 준비하고 joiner는 준비하지 않은 채로 둔다.
    await callAsPromise(handleSetReady, io, hostSocket, 'uuid-start-notready-host', readyPayload(created.room))

    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-notready-host', startPayload(created.room), callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PLAYERS_NOT_READY')
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: callback이 없는 요청은 어떤 상태도 바꾸지 않는다', async () => {
    // 방장 권한까지 통과할 수 있는 정상 방을 만들어, "검사 자체가 실행되긴 하지만 callback이
    // 없어 응답도 상태 변경도 하지 않는지"를 확인한다(가장 앞단 검사가 우선임을 재확인).
    const hostSocket = createFakeSocket('uuid-start-nocb')
    const io = createFakeIo([hostSocket])
    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'uuid-start-nocb', validSettingsPayload())

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    // F-23(AC-04): 공용 fixture가 이제 방송을 **실제 수신자에게 전달**한다 — 방 생성이 이미
    // 낸 공개 목록 갱신이 이 소켓에도 기록돼 있다. 이 시험이 보는 것은 "start_game이 추가로
    // 무엇을 보냈는가"이므로 기준선을 잡고 그 증가분을 센다(단언의 의미는 그대로다).
    const emittedBefore = hostSocket.emitted.length
    await handleStartGame(io, hostSocket, 'uuid-start-nocb', startPayload(created.room), undefined)
    const after = matchmaking.__getStateSnapshotForTests()

    assert.deepEqual(after, before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    // 이제 start_game은 ack로만 응답하므로 emit 자체가 없어야 한다.
    assert.equal(hostSocket.emitted.length, emittedBefore)
})

// ── start_game: 성공 경로(GameSession 전환) ─────────────────────────────

// setupReadyRoomForStart는 handleCreateRoom/handleJoinRoomByCode/handleSetReady를
// 인자로 받는다(공유 fixture는 matchmaking.js를 require하지 않으므로) — 이 파일
// 상단에서 이미 matchmaking.__testables로 꺼내 둔 지역 변수를 그대로 묶어 넘긴다.
const readyRoomHandlers = { handleCreateRoom, handleJoinRoomByCode, handleSetReady }

test('start_game: 시작 직전 최신 서버 loadout으로 계정 외형을 다시 확보해 game_started에 반영한다(F-13 AC-05, 참가 시점이 아니라 시작 시점 값)', async () => {
    fakeGetGameStartLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: 'player-profile-금빛가면', profileBorderId: 'profile-border-평민', cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))

    const hostSocket = createFakeSocket('uuid-start-profile-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-start-profile-host', 'uuid-start-profile-joiner', readyRoomHandlers)

    // 대기방에 머무는 동안 방장이 프로필을 바꿨다고 가정한다 — game_started에는 참가
    // 시점 값이 아니라 지금(시작 시점) 값이 스냅샷되어야 한다.
    fakeGetGameStartLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: 'player-profile-드워프', profileBorderId: 'profile-border-귀족', cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-profile-host', startPayload(room), callback)
    assert.equal(getResponse().ok, true)

    const hostPayload = hostSocket.emitted.find((e) => e.event === 'game_started').payload
    const hostSelf = hostPayload.state.players.find((p) => p.uuid === 'uuid-start-profile-host')
    assert.equal(hostSelf.accountProfilePhotoId, 'player-profile-드워프')
    assert.equal(hostSelf.accountProfileBorderId, 'profile-border-귀족')
})

// F-14(AC-04) — 직업별 장착 스킨(accountSkinId)은 gameSession.session.test.js가 makePlayer에
// accountSkinsByJob을 직접 주입해 buildViewerRoleFields 계약만 검증한다. 그 계약이 실제
// 서버 조회(getGameStartLoadouts) → captureRoomStartProfiles → buildSessionCandidate로
// 이어지는지는 그 시험만으로는 보장되지 않는다 — 여기서는 합성 fixture 없이 실제
// handleStartGame 생산 경로를 그대로 통과시켜 확인한다. 카드 프레임(accountCardFrameId)은
// 직업 스킨과 달리 공개 필드라 players[] 전원에게 실린다(AC-01/AC-04) — 같은 경로로 함께 검증한다.
const ROLE_TO_SKIN_JOB_ID = {
    CITIZEN: 'noble', JOKER: 'clown', DOCTOR: 'doctor', GUARD: 'guard', WITCH_HUNTER: 'witchHunter',
}

test('start_game: 서버가 조회한 직업별 스킨은 자신의 실제 역할에 대응하는 accountSkinId 하나로만 self에 실리고, 카드 프레임은 players[] 전원에게 공개된다(F-14 AC-04, 실제 matchmaking 생산 경로)', async () => {
    const SKINS_BY_JOB = {
        noble: 'player-skin-귀족1-시험용',
        clown: 'player-skin-광대1-시험용',
        guard: 'player-skin-경비원1-시험용',
        doctor: 'player-skin-주치의-시험용',
        witchHunter: 'player-skin-마녀사냥꾼-시험용',
    }
    fakeGetGameStartLoadouts = async (userIds) =>
        Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: null, profileBorderId: null, cardFrameId: 'player-card-시험용',
            skinsByJob: SKINS_BY_JOB,
        }]))

    const hostSocket = createFakeSocket('uuid-start-skin-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-start-skin-host', 'uuid-start-skin-joiner', readyRoomHandlers)

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-skin-host', startPayload(room), callback)
    assert.equal(getResponse().ok, true)

    const hostPayload = hostSocket.emitted.find((e) => e.event === 'game_started').payload
    const expectedJobId = ROLE_TO_SKIN_JOB_ID[hostPayload.state.self.role]
    assert.equal(hostPayload.state.self.accountSkinId, SKINS_BY_JOB[expectedJobId])

    // 공용 players[]에는 어느 참가자의 accountSkinId·accountSkinsByJob도 실리면 안 된다
    // (역할 역산 방지) — 반면 accountCardFrameId는 비밀이 아니므로 전원에게 공개된다.
    for (const player of hostPayload.state.players) {
        assert.equal(Object.hasOwn(player, 'accountSkinId'), false)
        assert.equal(Object.hasOwn(player, 'accountSkinsByJob'), false)
        assert.equal(player.accountCardFrameId, 'player-card-시험용')
    }
})

test('start_game: 계정 외형 재조회가 실패하면 GameSession을 커밋하지 않고 실패로 응답한다', async () => {
    const hostSocket = createFakeSocket('uuid-start-econ-fail-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-start-econ-fail-host', 'uuid-start-econ-fail-joiner', readyRoomHandlers)

    fakeGetGameStartLoadouts = async () => { throw new Error('economy 조회 실패(테스트 주입)') }

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-econ-fail-host', startPayload(room), callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'INTERNAL_ERROR')
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0, '계정 외형 조회가 실패했으면 GameSession이 커밋되면 안 된다')
    const roomSnapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(roomSnapshot.gameRooms.length, 1, '방은 그대로 유지되어야 한다')
    assert.equal(joinerSocket.emitted.filter((e) => e.event === 'game_started').length, 0)
})

test('start_game: 계정 외형 재조회 중 참가자가 준비를 해제하면 ROOM_STATE_CHANGED로 거부하고 room.players를 부분 반영하지 않는다', async () => {
    const hostSocket = createFakeSocket('uuid-start-race-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room: startedRoom } = await setupReadyRoomForStart(io, 'uuid-start-race-host', 'uuid-start-race-joiner', readyRoomHandlers)

    // captureRoomStartProfiles의 조회(getGameStartLoadouts)가 끝나기 전에 방 상태가
    // 바뀌는 레이스를 재현한다 — deferred로 조회 완료 시점을 결정적으로 제어한다.
    const gate = deferred()
    fakeGetGameStartLoadouts = async (userIds) => {
        await gate.promise
        return Object.fromEntries(userIds.map((id) => [id, {
            profilePhotoId: 'player-profile-기사', profileBorderId: 'profile-border-귀족', cardFrameId: null,
            skinsByJob: { noble: null, clown: null, guard: null, doctor: null, witchHunter: null },
        }]))
    }

    const { callback, getResponse } = countingCallback()
    const startPromise = handleStartGame(io, hostSocket, 'uuid-start-race-host', startPayload(startedRoom), callback)

    // 조회가 아직 끝나지 않은 사이 참가자가 준비를 해제한다.
    await callAsPromise(handleSetReady, io, joinerSocket, 'uuid-start-race-joiner', readyPayload(startedRoom, false))
    gate.resolve()
    await startPromise

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'ROOM_STATE_CHANGED')
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0, '방 상태가 바뀌었으면 GameSession이 커밋되면 안 된다')

    const roomSnapshot = matchmaking.__getStateSnapshotForTests()
    const [, room] = roomSnapshot.gameRooms[0]
    const [, joinerEntry] = room.players.find(([playerUuid]) => playerUuid === 'uuid-start-race-joiner')
    assert.equal(joinerEntry.isReady, false, '레이스를 재현한 준비 해제 상태가 그대로 유지되어야 한다')
    // captureRoomStartProfiles가 무효화됐으므로 참가 시점(setupReadyRoomForStart 기본 fake:
    // profilePhotoId/profileBorderId 둘 다 null)에 실린 값 그대로여야 한다 — 이번 재조회
    // 결과('player-profile-기사'/'profile-border-귀족')로 부분 반영되면 안 된다.
    assert.equal(joinerEntry.accountProfilePhotoId, null, '조회가 무효화됐으면 room.players는 시작 재조회 이전(참가 시점) 값 그대로여야 한다')
})

test('start_game: 모든 조건을 충족하면 GameSession을 생성하고 참가자별로 역할이 다른 개별 game_started를 전달한다', async () => {
    const hostSocket = createFakeSocket('uuid-start-ok-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-start-ok-host', 'uuid-start-ok-joiner', readyRoomHandlers)

    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-start-ok-host', startPayload(room), callback)

    // (a) ack 정확히 1회, ok:true
    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, true)
    assert.equal(typeof getResponse().gameId, 'string')

    // (b) game-core registry에 세션 1개
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 1)

    // (c) gameRooms/playerRoom에서 Room 제거
    const roomSnapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(roomSnapshot.gameRooms.length, 0)
    assert.equal(roomSnapshot.playerRoom.length, 0)

    // (d) public_rooms_updated 방송 발생
    assert.equal(io.broadcasts.some((b) => b.event === 'public_rooms_updated'), true)

    // (e) 각 참가자 소켓이 game_started를 정확히 1회 받음
    const hostGameStarted = hostSocket.emitted.filter((e) => e.event === 'game_started')
    const joinerGameStarted = joinerSocket.emitted.filter((e) => e.event === 'game_started')
    assert.equal(hostGameStarted.length, 1)
    assert.equal(joinerGameStarted.length, 1)

    // (f) 공용 players[] 모든 원소에 role/team 키가 없음
    for (const { payload } of [...hostGameStarted, ...joinerGameStarted]) {
        for (const player of payload.state.players) {
            assert.equal(Object.hasOwn(player, 'role'), false)
            assert.equal(Object.hasOwn(player, 'team'), false)
        }
    }

    const hostPayload = hostGameStarted[0].payload
    const joinerPayload = joinerGameStarted[0].payload

    // (g) role 키를 가진 위치는 state.self.role 하나뿐
    assert.equal((JSON.stringify(hostPayload).match(/"role"/g) ?? []).length, 1)
    assert.equal((JSON.stringify(joinerPayload).match(/"role"/g) ?? []).length, 1)

    // (h) state.self.uuid가 수신 소켓의 uuid와 일치
    assert.equal(hostPayload.state.self.uuid, 'uuid-start-ok-host')
    assert.equal(joinerPayload.state.self.uuid, 'uuid-start-ok-joiner')

    // (i) state.self.role이 내부 세션의 실제 배정과 일치 — jokerCount:1/2명이므로 역할이 서로 다르다
    const roles = [hostPayload.state.self.role, joinerPayload.state.self.role]
    assert.equal(roles.includes('JOKER'), true)
    assert.equal(roles.includes('CITIZEN'), true)
})

test('start_game: 참가자 중 한 명의 소켓이 connected:false이면 PARTICIPANT_UNAVAILABLE로 거부되고 모든 상태가 불변이다', async () => {
    const hostSocket = createFakeSocket('uuid-pu-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-pu-host', 'uuid-pu-joiner', readyRoomHandlers)
    joinerSocket.connected = false // 참가자 중 한 명의 연결이 끊긴 상태를 재현

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    // setupReadyRoomForStart 자체가 create_room/join_room_by_code로 이미 public_rooms_updated를
    // 방송하므로, "이 실패 요청이 새 방송을 만들지 않는지"는 호출 전 개수와 비교해야 한다.
    const broadcastCountBefore = io.broadcasts.length
    const { callback, getCalls, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-pu-host', startPayload(room), callback)

    assert.equal(getCalls(), 1)
    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PARTICIPANT_UNAVAILABLE')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), false)
    assert.equal(io.broadcasts.length, broadcastCountBefore)
})

test('start_game: 참가자 중 한 명의 소켓이 Room channel에 join되어 있지 않으면 PARTICIPANT_UNAVAILABLE로 거부되고 모든 상태가 불변이다', async () => {
    const hostSocket = createFakeSocket('uuid-nc-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-nc-host', 'uuid-nc-joiner', readyRoomHandlers)
    // connected:true이지만 Room의 Socket.IO channel에는 join되어 있지 않은 상태를 재현한다
    // (force_disconnect 이후 재연결했지만 아직 이전 room에 다시 join하지 않은 짧은 구간 등).
    joinerSocket.rooms.delete(room.roomId)

    const before = matchmaking.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-nc-host', startPayload(room), callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PARTICIPANT_UNAVAILABLE')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
})

test('start_game: 동일 uuid의 정상적인 복수 소켓 모두에게 game_started가 전달된다', async () => {
    const hostSocket = createFakeSocket('uuid-multi-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-multi-host', 'uuid-multi-joiner', readyRoomHandlers)

    // 같은 uuid로 인증된 두 번째 소켓이 이미 같은 channel에 join된 상태(연결 전환 중 짧은 구간)를 재현한다.
    const joinerSecondSocket = createFakeSocket('uuid-multi-joiner', { id: 'sock-uuid-multi-joiner-2' })
    joinerSecondSocket.rooms.add(room.roomId)
    io.sockets.sockets.set(joinerSecondSocket.id, joinerSecondSocket)

    const { getResponse, callback } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-multi-host', startPayload(room), callback)

    assert.equal(getResponse().ok, true)
    assert.equal(joinerSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
    assert.equal(joinerSecondSocket.emitted.filter((e) => e.event === 'game_started').length, 1)
})

test('start_game: payload 사전 생성 단계에서 예외가 나면 INTERNAL_ERROR로 응답하고 모든 상태가 불변이며 game_started가 전달되지 않는다', async (t) => {
    const hostSocket = createFakeSocket('uuid-payloaderr-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-payloaderr-host', 'uuid-payloaderr-joiner', readyRoomHandlers)

    // node:test의 MockTracker는 테스트 종료 시 자동으로 원래 함수를 복원하므로, 이 mock이
    // 같은 프로세스의 후속 테스트로 새어 나가지 않는다(수동 try/finally 복원 불필요).
    t.mock.method(gameSession, 'buildGameStartedPayload', () => {
        throw new Error('테스트 강제 실패')
    })

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-payloaderr-host', startPayload(room), callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'INTERNAL_ERROR')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), false)
    assert.equal(joinerSocket.emitted.some((e) => e.event === 'game_started'), false)
})

test('start_game: notify 중 한 참가자의 emit이 실패해도 나머지는 정상 수신하고 host ack은 성공한다', async () => {
    const hostSocket = createFakeSocket('uuid-notifyerr-host')
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, 'uuid-notifyerr-host', 'uuid-notifyerr-joiner', readyRoomHandlers)
    joinerSocket.emit = () => { throw new Error('emit 실패(테스트 주입)') }

    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'uuid-notifyerr-host', startPayload(room), callback)

    assert.equal(getResponse().ok, true)
    assert.equal(hostSocket.emitted.some((e) => e.event === 'game_started'), true)
})

test('start_game: 참가자 중 한 명이 이미 다른 GameSession에 속해 있으면 새 Room 전체가 PLAYER_ALREADY_IN_SESSION으로 거부된다', async () => {
    // 먼저 정상 대기방을 만든 뒤, start_game 직전에 참가자 하나가 다른 경로에서 활성 세션에
    // 들어간 경합을 game-core의 실제 prepare/commit 경로로 재현한다. MM1 이후에는 이미
    // 인게임인 계정이 새 Room에 참가할 수 없으므로 이 순서만 계약상 가능한 회귀 시나리오다.
    const newHost = createFakeSocket('uuid-pais-new-host')
    const io = createFakeIo([newHost])
    const { joinerSocket: sharedSocket, room } = await setupReadyRoomForStart(
        io, 'uuid-pais-new-host', 'uuid-pais-shared', readyRoomHandlers,
    )
    const prepared = gameSession.prepareGameSession({
        id: 'uuid-pais-existing-game',
        players: new Map([
            ['uuid-pais-shared', { uuid: 'uuid-pais-shared', nickname: 'shared', isReady: true }],
            ['uuid-pais-existing-peer', { uuid: 'uuid-pais-existing-peer', nickname: 'peer', isReady: true }],
        ]),
        settings: { jokerCount: 1 },
    })
    assert.equal(prepared.ok, true)
    gameSession.commitGameSession(prepared.session)

    const before = matchmaking.__getStateSnapshotForTests()
    const beforeSession = gameSession.__getStateSnapshotForTests()
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, newHost, 'uuid-pais-new-host', startPayload(room), callback)

    assert.equal(getResponse().ok, false)
    assert.equal(getResponse().code, 'PLAYER_ALREADY_IN_SESSION')
    assert.deepEqual(matchmaking.__getStateSnapshotForTests(), before)
    assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSession)
})

test('start_game: 성공 후 같은 uuid로 get_current_room을 조회하면 room:null이 온다', async () => {
    const hostSocket = createFakeSocket('uuid-gcr-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-gcr-host', 'uuid-gcr-joiner', readyRoomHandlers)

    const startResult = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-gcr-host', startPayload(room))
    assert.equal(startResult.ok, true)

    const current = await callAsPromise(handleGetCurrentRoom, 'uuid-gcr-host')
    assert.equal(current.room, null)
})

test('start_game: 게임 시작 후 공개방 목록에 그 방이 더 이상 없다', async () => {
    const hostSocket = createFakeSocket('uuid-list-host')
    const io = createFakeIo([hostSocket])
    const { room } = await setupReadyRoomForStart(io, 'uuid-list-host', 'uuid-list-joiner', readyRoomHandlers)

    const startResult = await callAsPromise(handleStartGame, io, hostSocket, 'uuid-list-host', startPayload(room))
    assert.equal(startResult.ok, true)

    const list = await callAsPromise(handleGetPublicRooms)
    assert.equal(list.rooms.some((r) => r.id === room.roomId), false)
})

// ── AC-07: 새로고침 후 대기방 복구(재접속 유예) ──────────────────────────────
// 새로고침은 서버에게 disconnect 하나로만 보인다. 예전에는 그 즉시 방에서 뺐기 때문에
// 재접속 직후의 get_current_room이 언제나 room:null이었고 대기방이 복구되지 않았다.

test('AC-07: disconnect 직후 get_current_room은 여전히 이전 room ID를 반환한다', async () => {
    const socket = createFakeSocket('uuid-refresh')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-refresh', validSettingsPayload())

    matchmaking.onDisconnect(io, socket, 'uuid-refresh') // = 새로고침으로 탭이 소켓을 끊은 순간

    const res = await callAsPromise(handleGetCurrentRoom, 'uuid-refresh')
    assert.equal(res.ok, true)
    assert.equal(res.room.roomId, created.room.roomId, '새로고침 직후 조회가 이전 방을 잃어버렸습니다')
    assert.equal(res.room.roomCode, created.room.roomCode)
})

test('AC-07: 재조회로 복구가 확인되면 유예 예약이 취소되어 만료로도 방에서 빠지지 않는다', async () => {
    const socket = createFakeSocket('uuid-refresh-keep')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-refresh-keep', validSettingsPayload())

    matchmaking.onDisconnect(io, socket, 'uuid-refresh-keep')
    assert.deepEqual(
        matchmaking.__getPendingRoomRemovalsForTests(),
        [['uuid-refresh-keep', created.room.roomId]],
        'disconnect가 유예를 예약하지 않았습니다',
    )

    await callAsPromise(handleGetCurrentRoom, 'uuid-refresh-keep') // 재접속한 클라이언트의 재조회
    assert.deepEqual(matchmaking.__getPendingRoomRemovalsForTests(), [], '확인 후에도 예약이 남아있습니다')

    matchmaking.__flushRoomRetentionForTests() // 예약이 남아있었다면 여기서 제거됐을 것이다
    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([u]) => u === 'uuid-refresh-keep'), true)
    assert.equal(snapshot.gameRooms.some(([id]) => id === created.room.roomId), true)
})

test('AC-07: 재조회가 없는 채로 유예가 끝나면 예전처럼 방에서 제거된다', async () => {
    const host = createFakeSocket('uuid-grace-host')
    const io = createFakeIo([host])
    const created = await callAsPromise(handleCreateRoom, io, host, 'uuid-grace-host', validSettingsPayload())
    const joiner = createFakeSocket('uuid-grace-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-grace-joiner', created.room.roomCode)

    matchmaking.onDisconnect(io, joiner, 'uuid-grace-joiner')
    matchmaking.__flushRoomRetentionForTests()

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([u]) => u === 'uuid-grace-joiner'), false)
    assert.equal(io.broadcasts.some((b) => b.event === 'player_left_room'), true)
})

test('AC-07: 재접속한 새 소켓은 원래 방 채널에 다시 가입되고 activeRoomId가 결합된다', async () => {
    const socket = createFakeSocket('uuid-rejoin')
    const io = createFakeIo([socket])
    const created = await callAsPromise(handleCreateRoom, io, socket, 'uuid-rejoin', validSettingsPayload())

    matchmaking.onDisconnect(io, socket, 'uuid-rejoin')

    // 새로고침으로 만들어진 새 소켓이다(이전 소켓과 id가 다르다).
    const freshSocket = createFakeSocket('uuid-rejoin', { id: 'sock-uuid-rejoin-2' })
    io.sockets.sockets.set(freshSocket.id, freshSocket)
    await matchmaking.resyncRoomChannelOnReconnect(freshSocket, 'uuid-rejoin')

    // 채널 재가입이 없으면 복구된 클라이언트는 방 방송을 하나도 받지 못하고, start_game의
    // "참가자 전원이 Room channel에 있어야 한다" 검사에도 걸려 방 전체가 시작하지 못한다.
    assert.equal(freshSocket.rooms.has(created.room.roomId), true)
    assert.equal(freshSocket.data.activeRoomId, created.room.roomId)
})

test('AC-07: 방에 속하지 않은 소켓의 재접속은 어떤 채널에도 가입시키지 않는다', async () => {
    const stranger = createFakeSocket('uuid-no-room')
    await matchmaking.resyncRoomChannelOnReconnect(stranger, 'uuid-no-room')

    assert.deepEqual(stranger.joined, [])
    assert.equal(stranger.data.activeRoomId, undefined)
})

test('AC-07: 재접속했지만 대기방으로 돌아오지 않으면 유예 만료 시 채널에서도 정리된다', async () => {
    const host = createFakeSocket('uuid-lobby-host')
    const io = createFakeIo([host])
    const created = await callAsPromise(handleCreateRoom, io, host, 'uuid-lobby-host', validSettingsPayload())
    const joiner = createFakeSocket('uuid-lobby-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-lobby-joiner', created.room.roomCode)

    matchmaking.onDisconnect(io, joiner, 'uuid-lobby-joiner')
    io.sockets.sockets.delete(joiner.id) // Socket.IO는 끊긴 소켓을 registry에서 지운다

    // 재접속은 했지만(예: 로비로 이동) get_current_room 확인은 오지 않은 경우다.
    const freshSocket = createFakeSocket('uuid-lobby-joiner', { id: 'sock-lobby-joiner-2' })
    io.sockets.sockets.set(freshSocket.id, freshSocket)
    await matchmaking.resyncRoomChannelOnReconnect(freshSocket, 'uuid-lobby-joiner')
    assert.equal(freshSocket.rooms.has(created.room.roomId), true)

    matchmaking.__flushRoomRetentionForTests()
    await Promise.resolve() // socket.leave는 비동기라 한 틱 흘려보낸다

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.playerRoom.some(([u]) => u === 'uuid-lobby-joiner'), false)
    assert.equal(freshSocket.rooms.has(created.room.roomId), false, '살아있는 소켓이 방 채널에 남았습니다')
})

test('AC-07: 유예 중 방이 이미 사라졌다면 만료가 뒤늦은 방송을 만들지 않는다', async () => {
    const host = createFakeSocket('uuid-stale-grace-host')
    const io = createFakeIo([host])
    const created = await callAsPromise(handleCreateRoom, io, host, 'uuid-stale-grace-host', validSettingsPayload())
    const joiner = createFakeSocket('uuid-stale-grace-joiner')
    io.sockets.sockets.set(joiner.id, joiner)
    await handleJoinRoomByCode(io, joiner, 'uuid-stale-grace-joiner', created.room.roomCode)

    matchmaking.onDisconnect(io, joiner, 'uuid-stale-grace-joiner')

    const { handleDeleteRoom } = matchmaking.__testables
    handleDeleteRoom(io, 'uuid-stale-grace-host') // 유예 중에 방장이 방을 통째로 삭제

    io.broadcasts.length = 0
    matchmaking.__flushRoomRetentionForTests()

    assert.equal(io.broadcasts.length, 0, '이미 사라진 방에 대해 뒤늦은 방송이 나갔습니다')
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.some(([id]) => id === created.room.roomId), false)
})


for (const failureStage of ['preflight', 'payload']) {
    test('F14 private loadouts never enter public room after ' + failureStage + ' failure', async (t) => {
        const hostId = 'uuid-private-host'
        const guestId = 'uuid-private-guest'
        const host = createFakeSocket(hostId)
        const io = createFakeIo([host])
        const { joinerSocket, room } = await setupReadyRoomForStart(io, hostId, guestId, readyRoomHandlers)
        const before = JSON.parse(JSON.stringify(await callAsPromise(handleGetCurrentRoom, hostId)))
        fakeGetGameStartLoadouts = async (ids) => Object.fromEntries(ids.map((id) => [id, {
            profilePhotoId: 'player-profile-드워프', profileBorderId: 'profile-border-귀족',
            cardFrameId: 'player-card-시험용',
            skinsByJob: Object.fromEntries(Object.values(ROLE_TO_SKIN_JOB_ID).map((job) => [job, id + '-private-' + job])),
        }]))
        if (failureStage === 'preflight') joinerSocket.connected = false
        else t.mock.method(gameSession, 'buildGameStartedPayload', () => { throw new Error('injected payload failure') })
        const failed = await callAsPromise(handleStartGame, io, host, hostId, startPayload(room))
        assert.equal(failed.ok, false)
        assert.equal(failed.code, failureStage === 'preflight' ? 'PARTICIPANT_UNAVAILABLE' : 'INTERNAL_ERROR')
        for (const id of [hostId, guestId]) {
            const current = await callAsPromise(handleGetCurrentRoom, id)
            for (const player of current.room.players) {
                assert.equal(Object.hasOwn(player, 'accountSkinsByJob'), false, 'private job map must never reach get_current_room')
                assert.equal(Object.hasOwn(player, 'accountSkinId'), false)
            }
            assert.deepEqual(current, before, 'failed start leaves the original public room unchanged')
        }
        assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
        joinerSocket.connected = true
        t.mock.restoreAll()
        const retried = await callAsPromise(handleStartGame, io, host, hostId, startPayload(room))
        assert.equal(retried.ok, true)
        for (const socket of [host, joinerSocket]) {
            const state = socket.emitted.find((event) => event.event === 'game_started').payload.state
            assert.equal(state.self.accountSkinId, state.self.uuid + '-private-' + ROLE_TO_SKIN_JOB_ID[state.self.role])
            for (const player of state.players) {
                assert.equal(Object.hasOwn(player, 'accountSkinsByJob'), false)
                assert.equal(Object.hasOwn(player, 'accountSkinId'), false)
                assert.equal(player.accountCardFrameId, 'player-card-시험용')
            }
        }
    })
}
