// 게임 시작 방송 파일
// 사람마다 보낼 시작 내용 (내 역할·색·프로필·설정)
// 게임 시작 방송은 socket 쪽이, 칸 만들기는 snapshot도 같이 씀
const { ROLE_TO_SKIN_JOB_ID, PLAYER_THEME_PALETTE_SIZE } = require('./constants')
const { ROLE_TEAMS } = require('../core/rules/roles')
const { buildRoomSettingsView } = require('../../utils/updateRoomSettingsValidation')

// 보는 사람 기준 역할 칸 (광대끼리는 서로 보임)
function buildViewerRoleFields(session, viewer) {
    if (!viewer) return null
    // 직업 스킨은 내 역할 것 하나만 (남의 스킨 보이면 역할 들킴, 지도 20-⑩)
    const skinJobId = ROLE_TO_SKIN_JOB_ID[viewer.role]
    const accountSkinsByJob = Object.hasOwn(viewer, 'accountSkinsByJob') ? viewer.accountSkinsByJob : null
    const hasAccountSkin = Boolean(skinJobId) && Object.hasOwn(accountSkinsByJob ?? {}, skinJobId)
    return {
        uuid: viewer.uuid,
        nickname: viewer.nickname,
        role: viewer.role,
        team: ROLE_TEAMS[viewer.role],
        ...(hasAccountSkin ? { accountSkinId: accountSkinsByJob[skinJobId] } : {}),
        // 광대면 동료 광대 uuid 목록 붙임
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
    // 판 id 글자로 시작 숫자 만들기 (같은 id면 같은 숫자)
    let seed = 0x811c9dc5
    for (let i = 0; i < id.length; i += 1) {
        seed ^= id.charCodeAt(i)
        seed = Math.imul(seed, 0x01000193) >>> 0
    }

    // 시작 숫자에서 0~1 사이 값 차례로 뽑기 (Math.random 대신)
    const nextRandom = () => {
        seed = (seed + 0x6d2b79f5) >>> 0
        let t = seed
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    // 색 번호 0~9를 그 값으로 섞음
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
function buildProfileFields(player) {
    return {
        ...(Object.hasOwn(player, 'accountProfilePhotoId') ? { accountProfilePhotoId: player.accountProfilePhotoId } : {}),
        ...(Object.hasOwn(player, 'accountProfileBorderId') ? { accountProfileBorderId: player.accountProfileBorderId } : {}),
        ...(Object.hasOwn(player, 'accountCardFrameId') ? { accountCardFrameId: player.accountCardFrameId } : {}),
        ...(Object.hasOwn(player, 'accountTotalGames') ? { accountTotalGames: player.accountTotalGames } : {}),
        ...(Object.hasOwn(player, 'accountWinRate') ? { accountWinRate: player.accountWinRate } : {}),
    }
}

// 방 설정 보여줄 칸
function buildSettingsFields(session) {
    const source = session?.roomSettingsSource
    // 설정 원본이 없거나 객체 아니면 칸 자체를 뺌
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
// players엔 역할 없음, 내 역할은 self에만 (지도 02-⑩)
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
            ...buildSettingsFields(session),
            participationRevision: session.participationRevision ?? 0,
            players: [...session.players.values()].map((player, index) => ({
                uuid: player.uuid,
                nickname: player.nickname,
                themeIndex: themeIndices[index % PLAYER_THEME_PALETTE_SIZE],
                isAlive: player.alive === true,
                isParticipating: player.isParticipating !== false,
                membershipId: player.membershipId ?? null,
                ...buildProfileFields(player),
            })),
            self: buildViewerRoleFields(session, viewer),
        },
    }
}

module.exports = {
    buildViewerRoleFields,
    buildPlayerThemeIndices,
    buildProfileFields,
    buildSettingsFields,
    buildGameStartedPayload,
}