// 방 정보 파일
// 방 정보 내용 만들기 + 공개 방 목록 만들기·방송
const { getRequiredPlayers } = require('../core/config')
const { resolveRoleComposition } = require('../../../game-core/core/rules/roleComposition')
const { hasPendingAdmission } = require('../admission/attempts')
const { BOOT_EPOCH } = require('../core/constants')
const { getSettingsVersion } = require('../settings/receipts')
const { buildRoomSettingsView, buildEditableSettingsView } = require('../../../validations/room/updateSettings')
const { deps } = require('../core/deps')
const { gameRooms } = require('../core/state')

// 시작 가능한지 (인원·전원 준비·입장 중인 사람 없음)
function computeCanStart(room) {
    const players = [...room.players.values()]
    // 서버 시작 판정과 같은 인원 기준 (운영 5명, 화면 표시와 실제 시작이 안 어긋나게)
    const requiredPlayers = getRequiredPlayers(room.settings?.maxPlayers)
    const jokerCount = room.settings?.jokerCount ?? 0

    if (players.length < requiredPlayers) return false
    if (players.length <= jokerCount) return false
    if (!resolveRoleComposition(room.settings, players.length).ok) return false
    if (hasPendingAdmission(room.id)) return false
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

// 참가자 프로필 읽기 (DB, 꾸밈이 없으면 기본값, 조회 실패는 던짐 → 방 만들기·입장이 실패로 답함)
async function loadPlayerProfile(uuid) {
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
    loadPlayerProfile,
    buildPublicRoomList,
    emitPublicRoomList,
}
