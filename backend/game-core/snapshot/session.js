// 판 스냅샷 파일
// 새로고침·재접속 때 보낼 판 전체 모습 + 사람별로 보이는 것만
const { buildPlayerThemeIndices, buildRoomSettingsSourceFields, PLAYER_THEME_PALETTE_SIZE, buildPlayerAccountProfileFields, buildViewerRoleFields } = require('../setup')
const { getDayPhase, buildDayVoteResolvedPayload } = require('../phase/day')
const { computeHasActedThisPhase, buildSelfSubmissionFields, buildPublicPhaseProgress } = require('./progress')
const { buildNightResultAppliedPayload } = require('../phase/night')
const { buildTribunalVoteResolvedPayload } = require('../phase/tribunal')
const { buildPublicWinResult } = require('../result')
const { playerSession, gameSessions } = require('../core/state')
const { isForfeitedFromSession } = require('../queries')

// 스냅샷에 낮·재판 칸 넣어도 되는지
function canIncludeDayTribunalFields(session) {
    if (session.phase === 'DAY' || session.phase === 'TRIBUNAL') return true
    if (session.phase === 'ENDED') {
        return session.nightResolution !== null && session.nightResolution.dayIndex !== session.dayIndex
    }
    return false
}

// 보는 사람 기준 판 스냅샷 (내 역할·진행·투표·재판·밤 결과)
function buildSessionSnapshot(session, uuid) {
    const viewer = session.players.get(uuid)
    const themeIndices = buildPlayerThemeIndices(session)
    const fields = {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        hostUuid: session.hostUuid ?? null,
        roomId: session.roomId ?? null,
        roomInstanceId: session.roomInstanceId ?? null,
        bootEpoch: session.bootEpoch ?? null,
        roomCode: session.roomCode ?? null,
        ...buildRoomSettingsSourceFields(session),
        participationRevision: session.participationRevision ?? 0,
        selfProgressSeq: session.selfProgressSeq ?? 0,
        ...(session.phase === 'DAY' ? { dayPhase: getDayPhase(session) } : {}),
        players: [...session.players.values()].map((player, index) => ({
            uuid: player.uuid,
            nickname: player.nickname,
            isAlive: player.alive,
            isParticipating: player.isParticipating !== false,
            membershipId: player.membershipId ?? null,
            themeIndex: themeIndices[index % PLAYER_THEME_PALETTE_SIZE],
            ...buildPlayerAccountProfileFields(player),
        })),
        self: {
            ...buildViewerRoleFields(session, viewer),
            hasActedThisPhase: computeHasActedThisPhase(session, uuid),
            ...buildSelfSubmissionFields(session, uuid),
        },
        progress: buildPublicPhaseProgress(session),
    }

    if (session.nightResolution) {
        const { dayIndex, victimUuid, deathReveals } = buildNightResultAppliedPayload(
            session,
            session.nightResolution.pendingEliminationTargetId,
            session.nightResolution.publicDeathReveals,
        )
        fields.nightResult = { dayIndex, victimUuid, deathReveals }
    }

    if (canIncludeDayTribunalFields(session)) {
        if (session.dayVoteResolution && session.dayVoteResolution.dayIndex === session.dayIndex) {
            const { round, outcome, tribunalTargetUuid, publicVoteCount, publicAbstainCount, revoteExcludedUuids } =
                buildDayVoteResolvedPayload(session, session.dayVoteResolution)
            fields.dayVoteResolution = {
                round,
                outcome,
                tribunalTargetUuid,
                publicVoteCount,
                publicAbstainCount,
                revoteExcludedUuids,
            }
        }

        if (session.tribunal && session.tribunal.dayIndex === session.dayIndex) {
            if (session.tribunal.resolved) {
                const { defendantUuid, outcome, counts, executedUuid } = buildTribunalVoteResolvedPayload(session)
                fields.tribunal = { defendantUuid, resolved: true, outcome, counts: { ...counts }, executedUuid }
            } else {
                fields.tribunal = { defendantUuid: session.tribunal.defendantUuid, resolved: false }
            }
        }
    }

    if (session.winResult) fields.winResult = buildPublicWinResult(session)

    return fields
}

// 사람 → 지금 판 스냅샷 (판 없거나 기권했으면 거절)
function getSessionSnapshotForPlayer(uuid, expectedGameId) {
    const gameId = playerSession.get(uuid)
    if (!gameId) {
        const normalized = typeof expectedGameId === 'string' ? expectedGameId.trim() : ''
        if (normalized && isForfeitedFromSession(normalized, uuid)) {
            return { ok: false, code: 'FORFEITED_FROM_SESSION' }
        }
        return { ok: false, code: 'NOT_A_PARTICIPANT' }
    }

    const session = gameSessions.get(gameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (isForfeitedFromSession(gameId, uuid)) return { ok: false, code: 'FORFEITED_FROM_SESSION' }

    if (expectedGameId !== undefined) {
        const normalizedExpected = typeof expectedGameId === 'string' ? expectedGameId.trim() : ''
        if (!normalizedExpected || normalizedExpected !== session.id) {
            return { ok: false, code: 'GAME_ID_MISMATCH' }
        }
    }

    return { ok: true, snapshot: buildSessionSnapshot(session, uuid) }
}

module.exports = {
    canIncludeDayTribunalFields,
    buildSessionSnapshot,
    getSessionSnapshotForPlayer,
}
