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

// 공개 방 목록 방송 사이 최소 간격 (방 만들기·입장·준비·나가기마다 접속자 전원에게 목록 전체를 보내던 것 묶기)
// 판 여럿을 한꺼번에 차리면 1초에 수십 번 × 접속자 수백 명 → 0.5초에 한 번, 마지막 상태는 꼭 보냄 (부하 줄이기 2026-11-09)
const PUBLIC_ROOM_LIST_MIN_GAP_MS = 500

// io마다 방송 상태 (서버엔 io 하나, 시험은 io를 새로 만들어 서로 안 섞임)
const listBroadcastStates = new WeakMap()

// 지금 목록을 전원에게 보냄
function sendPublicRoomList(io, state) {
    state.lastSentAt = Date.now()
    try {
        io.emit('public_rooms_updated', { rooms: buildPublicRoomList() })
    } catch (error) {
        console.error('[공개방 목록 알림 실패]', error)
    }
}

// 공개 방 목록 전원에게 방송: 앞 방송에서 간격 지났으면 바로, 아니면 간격 끝에 한 번 (그때 목록을 새로 만들어 마지막 상태가 감)
function emitPublicRoomList(io) {
    if (typeof io?.emit !== 'function') return
    let state = listBroadcastStates.get(io)
    if (!state) {
        state = { lastSentAt: -Infinity, timer: null }
        listBroadcastStates.set(io, state)
    }
    if (state.timer !== null) return
    const waitMs = PUBLIC_ROOM_LIST_MIN_GAP_MS - (Date.now() - state.lastSentAt)
    if (waitMs <= 0) {
        sendPublicRoomList(io, state)
        return
    }
    state.timer = setTimeout(() => {
        state.timer = null
        sendPublicRoomList(io, state)
    }, waitMs)
    state.timer.unref?.()
}

// 시험용: 간격 기다리는 목록 방송을 지금 보냄 (기다리는 게 없으면 아무것도 안 함)
function flushPublicRoomList(io) {
    const state = listBroadcastStates.get(io)
    if (!state || state.timer === null) return
    clearTimeout(state.timer)
    state.timer = null
    sendPublicRoomList(io, state)
}

module.exports = {
    computeCanStart,
    buildRoomPayload,
    loadPlayerProfile,
    buildPublicRoomList,
    emitPublicRoomList,
    PUBLIC_ROOM_LIST_MIN_GAP_MS,
    flushPublicRoomList,
}
