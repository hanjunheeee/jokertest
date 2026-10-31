// 게임 시작 방송 파일
// 사람마다 보낼 시작 내용 (내 역할·색·프로필·설정)
const { ROLE_TO_SKIN_JOB_ID, PLAYER_THEME_PALETTE_SIZE } = require('./constants')
const { ROLE_TEAMS } = require('../core/roles')
const { buildRoomSettingsView } = require('../../utils/updateRoomSettingsValidation')

// 보는 사람 기준 역할 칸 (광대끼리는 서로 보임)
function buildViewerRoleFields(session, viewer) {
    if (!viewer) return null
    const skinJobId = ROLE_TO_SKIN_JOB_ID[viewer.role]
    const accountSkinsByJob = Object.hasOwn(viewer, 'accountSkinsByJob') ? viewer.accountSkinsByJob : null
    const hasAccountSkin = Boolean(skinJobId) && Object.hasOwn(accountSkinsByJob ?? {}, skinJobId)
    return {
        uuid: viewer.uuid,
        nickname: viewer.nickname,
        role: viewer.role,
        team: ROLE_TEAMS[viewer.role],
        ...(hasAccountSkin ? { accountSkinId: accountSkinsByJob[skinJobId] } : {}),
        ...(viewer.role === 'JOKER'
            ? {
                  allies: [...session.players.values()]
                      .filter((p) => p.role === 'JOKER' && p.uuid !== viewer.uuid)
                      .map((p) => p.uuid),
              }
            : {}),
    }
}

// 사람마다 색 번호 (판 id로 섞어서 같은 판이면 늘 같은 순서)
function buildPlayerThemeIndices(session) {
    const id = typeof session?.id === 'string' ? session.id : ''
    let seed = 0x811c9dc5
    for (let i = 0; i < id.length; i += 1) {
        seed ^= id.charCodeAt(i)
        seed = Math.imul(seed, 0x01000193) >>> 0
    }

    const nextRandom = () => {
        seed = (seed + 0x6d2b79f5) >>> 0
        let t = seed
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const indices = Array.from({ length: PLAYER_THEME_PALETTE_SIZE }, (_, index) => index)
    for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(nextRandom() * (i + 1))
        const swap = indices[i]
        indices[i] = indices[j]
        indices[j] = swap
    }
    return indices
}

// 사람 프로필 칸 (사진·테두리·카드틀·전적, 있는 것만)
function buildPlayerAccountProfileFields(player) {
    return {
        ...(Object.hasOwn(player, 'accountProfilePhotoId') ? { accountProfilePhotoId: player.accountProfilePhotoId } : {}),
        ...(Object.hasOwn(player, 'accountProfileBorderId') ? { accountProfileBorderId: player.accountProfileBorderId } : {}),
        ...(Object.hasOwn(player, 'accountCardFrameId') ? { accountCardFrameId: player.accountCardFrameId } : {}),
        ...(Object.hasOwn(player, 'accountTotalGames') ? { accountTotalGames: player.accountTotalGames } : {}),
        ...(Object.hasOwn(player, 'accountWinRate') ? { accountWinRate: player.accountWinRate } : {}),
    }
}

// 방 설정 보여줄 칸
function buildRoomSettingsSourceFields(session) {
    const source = session?.roomSettingsSource
    if (source === null || typeof source !== 'object' || Array.isArray(source)) return {}
    return {
        roomSettingsSource: {
            accessType: source.accessType ?? null,
            settingsVersion: Number.isInteger(source.settingsVersion) ? source.settingsVersion : null,
            settings: buildRoomSettingsView(source.settings),
        },
    }
}

// 게임 시작 방송 내용 (보는 사람마다 다름)
function buildGameStartedPayload(session, viewerUuid) {
    const viewer = session.players.get(viewerUuid)
    const themeIndices = buildPlayerThemeIndices(session)
    return {
        gameId: session.id,
        state: {
            id: session.id,
            phase: session.phase,
            dayIndex: session.dayIndex,
            hostUuid: session.hostUuid ?? null,
            roomId: session.roomId ?? null,
            roomInstanceId: session.roomInstanceId ?? null,
            bootEpoch: session.bootEpoch ?? null,
            roomCode: session.roomCode ?? null,
            ...buildRoomSettingsSourceFields(session),
            participationRevision: session.participationRevision ?? 0,
            players: [...session.players.values()].map((player, index) => ({
                uuid: player.uuid,
                nickname: player.nickname,
                themeIndex: themeIndices[index % PLAYER_THEME_PALETTE_SIZE],
                isAlive: player.alive === true,
                isParticipating: player.isParticipating !== false,
                membershipId: player.membershipId ?? null,
                ...buildPlayerAccountProfileFields(player),
            })),
            self: buildViewerRoleFields(session, viewer),
        },
    }
}

module.exports = {
    buildViewerRoleFields,
    buildPlayerThemeIndices,
    buildPlayerAccountProfileFields,
    buildRoomSettingsSourceFields,
    buildGameStartedPayload,
}