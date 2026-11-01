// 판 스냅샷 파일
// 새로고침·재접속 때 보낼 판 전체 모습 + 사람별로 보이는 것만
// socket 쪽이 gameSession.js 통해서 판 다시 그릴 때 사용
const { buildPlayerThemeIndices, buildSettingsFields, PLAYER_THEME_PALETTE_SIZE, buildProfileFields, buildViewerRoleFields } = require('../setup')
const { getDayPhase, buildDayVoteResolvedPayload } = require('../phase/day')
const { computeHasActed, buildSelfSubmissionFields, buildPublicPhaseProgress } = require('./progress')
const { buildNightResultAppliedPayload } = require('../phase/night')
const { buildTribunalVoteResolvedPayload } = require('../phase/tribunal')
const { buildPublicWinResult } = require('../result')
const { normalizeGameId } = require('../core/registry/lookup')
const { isForfeitedFromSession, getPlayerGameId, getSessionById } = require('../queries')

// 스냅샷에 낮·재판 칸 넣어도 되는지
function canIncludeVoteFields(session) {
    if (session.phase === 'DAY' || session.phase === 'TRIBUNAL') return true
    // 끝난 판은 밤 결과 날짜가 지금 날짜와 다를 때만 (밤에 끝난 판이면 뺌)
    if (session.phase === 'ENDED') {
        return session.nightResolution !== null && session.nightResolution.dayIndex !== session.dayIndex
    }
    return false
}

// 보는 사람 기준 판 스냅샷 (내 역할·진행·투표·재판·밤 결과)
function buildSessionSnapshot(session, uuid) {
    const viewer = session.players.get(uuid)
    const themeIndices = buildPlayerThemeIndices(session)
    // 모두에게 같은 칸: 판 정보·사람 목록(역할 없음)·진행 표시
    const fields = {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        hostUuid: session.hostUuid ?? null,
        roomId: session.roomId ?? null,
        roomInstanceId: session.roomInstanceId ?? null,
        bootEpoch: session.bootEpoch ?? null,
        roomCode: session.roomCode ?? null,
        ...buildSettingsFields(session),
        participationRevision: session.participationRevision ?? 0,
        selfProgressSeq: session.selfProgressSeq ?? 0,
        // 낮이면 토론·투표 중 어느 쪽인지
        ...(session.phase === 'DAY' ? { dayPhase: getDayPhase(session) } : {}),
        players: [...session.players.values()].map((player, index) => ({
            uuid: player.uuid,
            nickname: player.nickname,
            isAlive: player.alive,
            isParticipating: player.isParticipating !== false,
            membershipId: player.membershipId ?? null,
            themeIndex: themeIndices[index % PLAYER_THEME_PALETTE_SIZE],
            ...buildProfileFields(player),
        })),
        // 나만 보는 칸: 내 역할·내가 이미 했는지·내가 낸 것
        self: {
            ...buildViewerRoleFields(session, viewer),
            hasActedThisPhase: computeHasActed(session, uuid),
            ...buildSelfSubmissionFields(session, uuid),
        },
        progress: buildPublicPhaseProgress(session),
    }

    // 밤 판정이 있으면 공개 결과만 (누가 죽었나)
    if (session.nightResolution) {
        const { dayIndex, victimUuid, deathReveals } = buildNightResultAppliedPayload(
            session,
            session.nightResolution.pendingEliminationTargetId,
            session.nightResolution.publicDeathReveals,
        )
        fields.nightResult = { dayIndex, victimUuid, deathReveals }
    }

    // 낮·재판 칸은 넣어도 되는 단계일 때만
    if (canIncludeVoteFields(session)) {
        // 오늘 낮 투표 결과 (누가 누굴 찍었는지는 빼고 숫자만)
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

        // 오늘 재판: 끝났으면 결과까지, 아직이면 피고만
        if (session.tribunal && session.tribunal.dayIndex === session.dayIndex) {
            if (session.tribunal.resolved) {
                const { defendantUuid, outcome, counts, executedUuid } = buildTribunalVoteResolvedPayload(session)
                fields.tribunal = { defendantUuid, resolved: true, outcome, counts: { ...counts }, executedUuid }
            } else {
                fields.tribunal = { defendantUuid: session.tribunal.defendantUuid, resolved: false }
            }
        }
    }

    // 판이 끝났으면 승패 결과
    if (session.winResult) fields.winResult = buildPublicWinResult(session)

    return fields
}

// 사람 → 지금 판 스냅샷 (판 없거나 기권했으면 거절)
function getSessionSnapshotForPlayer(uuid, expectedGameId) {
    const gameId = getPlayerGameId(uuid)
    // 판에 없을 때: 그 판에서 기권한 거면 기권으로, 아니면 참가자 아님
    if (!gameId) {
        const normalized = normalizeGameId(expectedGameId)
        if (normalized && isForfeitedFromSession(normalized, uuid)) {
            return { ok: false, code: 'FORFEITED_FROM_SESSION' }
        }
        return { ok: false, code: 'NOT_A_PARTICIPANT' }
    }

    // 판 찾기, 내가 판에 있고 기권 안 했는지
    const session = getSessionById(gameId)
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (!session.players.has(uuid)) return { ok: false, code: 'NOT_A_PARTICIPANT' }
    if (isForfeitedFromSession(gameId, uuid)) return { ok: false, code: 'FORFEITED_FROM_SESSION' }

    // 화면이 판 id를 같이 보냈으면 지금 판이랑 같은지 (옛 판 화면 거절)
    if (expectedGameId !== undefined) {
        const normalizedExpected = normalizeGameId(expectedGameId)
        if (!normalizedExpected || normalizedExpected !== session.id) {
            return { ok: false, code: 'GAME_ID_MISMATCH' }
        }
    }

    return { ok: true, snapshot: buildSessionSnapshot(session, uuid) }
}

module.exports = {
    canIncludeVoteFields,
    buildSessionSnapshot,
    getSessionSnapshotForPlayer,
}
