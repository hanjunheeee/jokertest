// 방 정보 파일
// 방 정보 내용 만들기 + 공개 방 목록 만들기·방송 (Node 여러 개면 다른 Node 방도 합쳐 내 Node 사람에게만, matchmaking/cluster/roomListSync.js)
const cluster = require('../../../cluster')
const roomListSync = require('../cluster/roomListSync')
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

// 공개 방 목록 만들기 (이 Node 방만), Node 여러 개면 항목마다 node 칸 (MN-085)
function buildPublicRoomList() {
    const node = cluster.isEnabled() ? cluster.serverId() : null
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
            ...(node ? { node } : {}),
        }))
}

// 화면에 줄 목록: 단일 모드는 이 Node 방 그대로, Node 여러 개면 다른 Node 스냅샷과 합침 (MN-082)
function buildMergedPublicRoomList() {
    const local = buildPublicRoomList()
    return cluster.isEnabled() ? roomListSync.mergedRooms(local) : local
}

// 공개 방 목록 방송 사이 최소 간격 (방 만들기·입장·준비·나가기마다 접속자 전원에게 목록 전체를 보내던 것 묶기)
// 판 여럿을 한꺼번에 차리면 1초에 수십 번 × 접속자 수백 명 → 0.5초에 한 번, 마지막 상태는 꼭 보냄 (부하 줄이기 2026-11-09)
const PUBLIC_ROOM_LIST_MIN_GAP_MS = 500

// io마다 방송 상태 (서버엔 io 하나, 시험은 io를 새로 만들어 서로 안 섞임)
const listBroadcastStates = new WeakMap()

// 지금 목록을 전원에게 보냄
// Node 여러 개면 내 방이 바뀌었을 때 스냅샷도 보내고, 방송은 내 Node 사람에게만 (io.local, 어댑터로 Redis 안 탐, MN-086)
function sendPublicRoomList(io, state) {
    state.lastSentAt = Date.now()
    try {
        if (!cluster.isEnabled()) {
            io.emit('public_rooms_updated', { rooms: buildPublicRoomList() })
            return
        }
        const local = buildPublicRoomList()
        roomListSync.publishLocalSnapshot(local)
        const target = io.local ?? io
        target.emit('public_rooms_updated', { rooms: roomListSync.mergedRooms(local) })
    } catch (error) {
        console.error('[공개방 목록 알림 실패]', error)
    }
}

// 공개 방 목록 전원에게 방송: 앞 방송에서 간격 지났으면 바로, 아니면 간격 끝에 한 번 (그때 목록을 새로 만들어 마지막 상태가 감)
// 방이 바뀔 때마다 불림 → Node 여러 개면 방 디렉터리 맞추기·스냅샷 보낼 표시도 같이
function emitPublicRoomList(io) {
    roomListSync.markLocalRoomsChanged()
    scheduleListBroadcast(io)
}

// 목록 방송 예약 (0.5초 묶음), 다른 Node 스냅샷을 받았을 때도 이것만 부름 (내 방은 안 바뀜)
function scheduleListBroadcast(io) {
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

// 다른 Node 스냅샷 받으면 이 io로 다시 보내게 연결
roomListSync.setRoomListHooks({ buildLocal: buildPublicRoomList, rebroadcast: scheduleListBroadcast })

module.exports = {
    computeCanStart,
    buildRoomPayload,
    loadPlayerProfile,
    buildPublicRoomList,
    buildMergedPublicRoomList,
    emitPublicRoomList,
    PUBLIC_ROOM_LIST_MIN_GAP_MS,
    flushPublicRoomList,
}
