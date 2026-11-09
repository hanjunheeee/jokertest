// 게임 시작 파일
// 방장 게임 시작 요청 검사 + 시작 직전 프로필 잡기 (판 만들기·방송은 startLaunch.js), matchmaking.js가 사건 받아 부름 (지도 02)
const { playerRoom, gameRooms } = require('../core/state')
const { getSettingsVersion } = require('../settings/receipts')
const { deps } = require('../core/deps')
const { BOOT_EPOCH } = require('../core/constants')
const { ROOM_SETTINGS_ERROR_CODES } = require('../../../validations/room/updateSettings')
const { getRequiredPlayers } = require('../core/config')
const { resolveRoleComposition } = require('../../../game-core/core/rules/roleComposition')
const { hasPendingAdmission } = require('../admission/attempts')
const { loadStartPalettes } = require('./startPalettes')
const { launchGame } = require('./startLaunch')

// 프로필 읽는 사이 방장·명단·자리·준비·설정 버전이 그대로인지
function isStartStillValid(room, hostUuid, playersAtCapture, versionAtCapture) {
    if (room.hostUuid !== hostUuid) return false
    if (room.players.size !== playersAtCapture.size) return false
    for (const [u, player] of playersAtCapture) {
        if (room.players.get(u) !== player) return false
        if (playerRoom.get(u) !== room.id) return false
        if (player.membershipId !== room.players.get(u)?.membershipId) return false
        if (player.isReady !== true) return false
    }
    if (versionAtCapture !== undefined && versionAtCapture !== getSettingsVersion(room)) {
        return false
    }
    return true
}

// 시작 직전 참가자 프로필 읽기 (그사이 방 바뀌면 멈춤)
async function captureStartProfiles(room, hostUuid, playersAtCapture, versionAtCapture) {
    const uuids = [...playersAtCapture.keys()]
    // 외형·전적·이모지 팔레트 같이 읽기, 전적·팔레트는 실패해도 빈 값으로 시작 (외형 실패는 던짐)
    const [loadouts, recordSummaries, emojiPaletteEntries] = await Promise.all([
        deps.economyService.getGameStartLoadouts(uuids),
        Promise.resolve()
            .then(() => deps.gameResultRepository.getAccountRecordSummaries(uuids))
            .then((summaries) => (summaries instanceof Map ? summaries : new Map()))
            .catch((error) => {
                console.error('[matchmaking] 계정 전적 조회 실패 — 전적 없이 게임을 시작합니다', error)
                return new Map()
            }),
        loadStartPalettes(uuids),
    ])

    // 읽는 사이 방이 바뀌었으면 시작 안 함
    if (!isStartStillValid(room, hostUuid, playersAtCapture, versionAtCapture)) {
        return { ok: false, code: 'ROOM_STATE_CHANGED' }
    }

    // 명단 복사본에 외형·전적 붙임 (전적은 판 수·승률 둘 다 정수일 때만, 스킨 없으면 직업별 null)
    const players = new Map(uuids.map((uuid) => {
        const loadout = loadouts[uuid] ?? {}
        const record = recordSummaries.get(uuid)
        const hasRecord = Number.isInteger(record?.totalGames) && Number.isInteger(record?.winRate)
        return [uuid, {
            ...room.players.get(uuid),
            accountProfilePhotoId: loadout.profilePhotoId ?? null,
            accountProfileBorderId: loadout.profileBorderId ?? null,
            accountCardFrameId: loadout.cardFrameId ?? null,
            ...(hasRecord
                ? { accountTotalGames: record.totalGames, accountWinRate: record.winRate }
                : {}),
            accountSkinsByJob: { ...(loadout.skinsByJob
                ?? { noble: null, clown: null, guard: null, doctor: null, witchHunter: null }) },
        }]
    }))
    // 설정 복사 (역할 수·밤 시간은 안쪽까지 복사, 판이 방 설정 객체를 같이 들지 않게)
    const settings = {
        ...room.settings,
        ...(room.settings?.roleCounts ? { roleCounts: { ...room.settings.roleCounts } } : {}),
        ...(room.settings?.roleNightActionTimes
            ? { roleNightActionTimes: { ...room.settings.roleNightActionTimes } }
            : {}),
    }
    return {
        ok: true,
        room: { ...room, players, settings, bootEpoch: BOOT_EPOCH },
        emojiPaletteByUuid: new Map(emojiPaletteEntries),
    }
}

// 방장 게임 시작: 검사 → 프로필 → 다시 검사 → 판 띄우기 (startLaunch.js)
async function handleStartGame(io, socket, uuid, payload, callback, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    // 계정의 지금 소켓인지 (새 탭에 밀린 옛 소켓 막기, 확인 함수 없으면 통과), 기다린 뒤 한 번 더 봄
    const isCanonicalSocket = () =>
        typeof getCurrentSocketId !== 'function' || getCurrentSocketId(uuid) === socket?.id
    const requestFailure = checkStartRequest(uuid, payload, isCanonicalSocket)
    if (requestFailure) {
        callback(requestFailure)
        return
    }

    // 지금 명단 찍어 두고 프로필 읽기 (DB 기다리는 사이 방이 바뀌면 멈춤)
    const { expectedSettingsVersion } = payload
    const roomId = playerRoom.get(uuid)
    const room = gameRooms.get(roomId)
    const playersAtCapture = new Map([...room.players.values()].map((player) => [player.uuid, player]))
    let captured
    try {
        captured = await captureStartProfiles(room, uuid, playersAtCapture, expectedSettingsVersion)
    } catch (err) {
        console.error('[게임 시작 계정 외형 조회 에러]', err)
        callback({ ok: false, code: 'INTERNAL_ERROR', message: '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' })
        return
    }
    const captureFailure = checkAfterCapture({ socket, uuid, roomId, room, captured, playersAtCapture, expectedSettingsVersion, isCanonicalSocket })
    if (captureFailure) {
        callback(captureFailure)
        return
    }

    launchGame(io, room, roomId, captured, callback)
}

// 시작 요청 검사: 지금 소켓 → 요청 모양 → 방·방장·설정 버전 → 시작 조건, 걸리면 실패 답 (통과면 null)
function checkStartRequest(uuid, payload, isCanonicalSocket) {
    if (!isCanonicalSocket()) return staleSocketFailure()
    return checkStartPayload(payload)
        ?? checkRoomAndHost(uuid, payload)
        ?? checkStartConditions(playerRoom.get(uuid))
}

// 요청 모양: 방 id·내가 본 설정 버전
function checkStartPayload(payload) {
    const invalid = { ok: false, code: ROOM_SETTINGS_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return invalid
    const { roomId: expectedRoomId, expectedSettingsVersion } = payload
    if (typeof expectedRoomId !== 'string' || expectedRoomId.length === 0) return invalid
    if (!Number.isSafeInteger(expectedSettingsVersion) || expectedSettingsVersion < 1) return invalid
    return null
}

// 요청한 방이 지금 내 방이고 내가 방장이고 내가 본 설정 그대로인지
function checkRoomAndHost(uuid, { roomId: expectedRoomId, expectedSettingsVersion }) {
    const roomId = playerRoom.get(uuid)
    const room = roomId ? gameRooms.get(roomId) : null
    if (!room || expectedRoomId !== roomId) {
        return { ok: false, code: 'ROOM_NOT_FOUND', message: '참여 중인 방을 찾을 수 없습니다.' }
    }
    if (room.hostUuid !== uuid) {
        return { ok: false, code: 'NOT_HOST', message: '방장만 게임을 시작할 수 있습니다.' }
    }
    if (expectedSettingsVersion !== getSettingsVersion(room)) return settingsChangedFailure(room, roomId)
    return null
}

// 인원·역할 구성·전원 준비·입장 중인 사람 없음 (view computeCanStart와 같은 조건)
// 운영은 정원과 상관없이 최소 5명 (한 판 5~10명 규칙), 개발만 정원이 최소보다 작으면 정원만 차면 됨
// 조커보다는 사람이 많아야 함
function checkStartConditions(roomId) {
    const room = gameRooms.get(roomId)
    const players = [...room.players.values()]
    const requiredPlayers = getRequiredPlayers(room.settings?.maxPlayers)
    const jokerCount = room.settings?.jokerCount ?? 0

    if (players.length < requiredPlayers || players.length <= jokerCount) {
        return { ok: false, code: 'MIN_PLAYERS_NOT_MET', message: '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.' }
    }
    if (!resolveRoleComposition(room.settings, players.length).ok) {
        return { ok: false, code: 'INVALID_ROLE_COMPOSITION', message: '설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요.' }
    }
    if (!players.every((player) => player.isReady === true)) {
        return { ok: false, code: 'PLAYERS_NOT_READY', message: '아직 준비하지 않은 참가자가 있습니다.' }
    }
    if (hasPendingAdmission(roomId)) return admissionInProgressFailure()
    return null
}

// 기다린 뒤 다시 확인: 방 지워짐·내가 나감·끊김·새 탭·설정 바뀜·명단 바뀜·입장 시작 (통과면 null)
function checkAfterCapture({ socket, uuid, roomId, room, captured, playersAtCapture, expectedSettingsVersion, isCanonicalSocket }) {
    const roomChanged = { ok: false, code: 'ROOM_STATE_CHANGED', message: '방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.' }
    if (!captured.ok) return { ...roomChanged, code: captured.code }
    if (gameRooms.get(roomId) !== room || playerRoom.get(uuid) !== roomId || socket?.connected === false) return roomChanged
    if (!isCanonicalSocket()) return staleSocketFailure()
    if (expectedSettingsVersion !== getSettingsVersion(room)) return settingsChangedFailure(room, roomId)
    if (!isStartStillValid(room, uuid, playersAtCapture, expectedSettingsVersion)) return roomChanged
    if (hasPendingAdmission(roomId)) return admissionInProgressFailure()
    return null
}

// 여러 검사에서 같이 쓰는 실패 답 (부를 때마다 새 객체)
function staleSocketFailure() {
    return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.STALE_SOCKET, message: '연결이 만료되었습니다. 다시 시도해주세요.' }
}

function settingsChangedFailure(room, roomId) {
    return {
        ok: false,
        code: 'ROOM_STATE_CHANGED',
        roomId,
        settingsVersion: getSettingsVersion(room),
        message: '방 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 시도해주세요.',
    }
}

function admissionInProgressFailure() {
    return { ok: false, code: 'ADMISSION_IN_PROGRESS', message: '입장 처리 중인 참가자가 있습니다. 잠시 후 다시 시도해주세요.' }
}

module.exports = {
    isStartStillValid,
    captureStartProfiles,
    handleStartGame,
}
