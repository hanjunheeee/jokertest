// 방 정보 파일
// 방 정보 내용 만들기 + 공개 방 목록 만들기·방송
const { getMinPlayers } = require('../core/config')
const { resolveRoleComposition } = require('../../../game-core/roleComposition')
const { hasPendingAdmissionForRoom } = require('../admission/attempts')
const { BOOT_EPOCH } = require('../core/constants')
const { getSettingsVersion } = require('../settings/receipts')
const { buildRoomSettingsView, buildEditableSettingsView } = require('../../../validations/room/updateSettings')
const { deps } = require('../core/deps')
const { gameRooms } = require('../core/state')

// 시작 가능한지 (인원·전원 준비·입장 중인 사람 없음)
function computeCanStart(room) {
    const players = [...room.players.values()]
    const configuredMinimum = getMinPlayers()
    const roomCapacity = room.settings?.maxPlayers ?? configuredMinimum
    const requiredPlayers = Math.min(configuredMinimum, roomCapacity)
    const jokerCount = room.settings?.jokerCount ?? 0

    if (players.length < requiredPlayers) return false
    if (players.length <= jokerCount) return false
    if (!resolveRoleComposition(room.settings, players.length).ok) return false
    if (hasPendingAdmissionForRoom(room.id)) return false
    return players.every((player) => player.isReady === true)
}

// 방 정보 내용 (명단·설정·버전·부팅 번호)
function buildRoomPayload(room) {
    return {
        roomId: room.id,
        roomCode: room.code,
        players: [...room.players.values()].map((player) => ({ ...player })),
        hostUuid: room.hostUuid,
        roomInstanceId: room.instanceId ?? null,
        bootEpoch: BOOT_EPOCH,
        canStart: computeCanStart(room),
        accessType: room.accessType ?? null,
        settingsVersion: getSettingsVersion(room),
        settings: buildRoomSettingsView(room.settings),
    }
}

// 참가자 프로필 읽기 (DB, 실패해도 기본값)
async function loadRoomParticipantProfile(uuid) {
    const loadouts = await deps.economyService.getPublicProfileLoadouts([uuid])
    const loadout = loadouts[uuid] ?? { profilePhotoId: null, profileBorderId: null }
    return {
        accountProfilePhotoId: loadout.profilePhotoId,
        accountProfileBorderId: loadout.profileBorderId,
    }
}

// 공개 방 목록 만들기
function buildPublicRoomList() {
    return [...gameRooms.values()]
        .filter((room) => room.accessType === 'open' || room.accessType === 'code')
        .map((room) => ({
            id: room.id,
            current: room.players.size,
            max: room.settings.maxPlayers,
            title: room.title,
            accessType: room.accessType,
            status: room.players.size >= room.settings.maxPlayers ? 'full' : 'waiting',
            settingsVersion: getSettingsVersion(room),
            settings: buildEditableSettingsView(room.settings),
        }))
}

// 공개 방 목록 전원에게 방송
function emitPublicRoomList(io) {
    if (typeof io?.emit !== 'function') return

    try {
        io.emit('public_rooms_updated', { rooms: buildPublicRoomList() })
    } catch (error) {
        console.error('[공개방 목록 알림 실패]', error)
    }
}

module.exports = {
    computeCanStart,
    buildRoomPayload,
    loadRoomParticipantProfile,
    buildPublicRoomList,
    emitPublicRoomList,
}
