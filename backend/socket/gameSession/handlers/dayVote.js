// 낮 투표 핸들러 파일
// 낮 투표 제출(1라운드 참여 기록 저장, 산 사람 표가 다 차면 5초 뒤 판정), register가 등록·시험은 gameSession.js로 바로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const gameAchievementService = require('../../../services/game/achievementHooks')
const { isolate, tryOr } = require('../../common/isolate')
const { respond } = require('../../common/replies')
const { pickGameTarget, acceptRequest, acceptCoreResult, registryLogs } = require('../core/requests')
const { emitProgressAfterSubmit } = require('../delivery/progress')
const { settleDayVoteIfComplete, deferDayVoteAchievement } = require('../phase/day')

// 낮 투표 제출 효과음 (기록 없거나 읽다 던지면 null, 효과음 없이 답함)
function buildDayVoteSfx(uuid, gameId) {
    const record = tryOr(null, () => gameSessionCore.readDayVoteSfx(uuid, gameId))
    if (record === null) return null
    return {
        kind: 'day-vote-submitted',
        eventId: record.eventId,
        accountId: uuid,
        gameId,
        dayIndex: record.dayIndex,
        round: record.round,
        origin: 'live',
    }
}

// 낮 투표 제출: 표 기록, 1라운드 진짜 표면 참여 기록 저장 뒤 ack (지도 04-③)
async function handleSubmitDayVote(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: callback이 던져도 밖으로 안 샘
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (지도 04-①⑨)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameTarget)
    if (!fields) return
    const { gameId, targetId } = fields

    // 여기부터 진짜 바뀜: 표 기록 (뒤 저장이 실패해도 표는 남음)
    const result = acceptCoreResult(ack, () => gameSessionCore.submitDayVote(uuid, gameId, targetId),
        registryLogs('[낮 투표 제출 처리 에러]', '[낮 투표 제출 registry 불일치]', uuid, gameId))
    if (!result) return

    // 효과음은 표 기록 뒤에 읽음
    const sfxEvent = buildDayVoteSfx(uuid, gameId)

    // 내 진행 상태 → ack → 산 사람 표가 다 찼으면 투표 마감 5초로 당김 (순서 고정, 저장 실패여도 표는 남아 셈)
    const ackThenSettle = (ackPayload) => {
        emitProgressAfterSubmit(io, uuid, gameId, 'SELF_PROGRESS_AFTER_SUBMIT')
        ack(ackPayload)
        isolate('[낮 투표 마감 당기기 실패]', { code: 'SUBMIT_SETTLE_ERROR', gameId },
            () => settleDayVoteIfComplete(gameId))
    }

    // 기권이거나 재투표 라운드면 참여 기록 없이 바로 답
    if (targetId === null || gameSessionCore.getSessionVoteRound(gameId) !== 1) {
        ackThenSettle({ ok: true, sfxEvent })
        return
    }

    // 1라운드 진짜 표: 참여 기록 저장이 끝나야 성공으로 답함, 실패면 다시 내라고 답함 (지도 04-③)
    const dayIndex = gameSessionCore.getSessionDayIndex(gameId)
    try {
        await gameAchievementService.recordParticipation({ gameId, dayIndex, userId: uuid })
    } catch {
        console.error('[투표 참여 사건 저장 실패]', { code: 'VOTE_PERSIST_ERROR', uuid, gameId })
        ackThenSettle({
            ok: false,
            code: 'VOTE_PERSIST_FAILED',
            message: '투표 저장에 실패했습니다. 다시 시도해 주세요.',
        })
        return
    }

    // 답 먼저, 업적 평가는 낮 끝에 묶어 한 번 (그 낮 타이머가 없으면 전처럼 바로, 기다리지 않음)
    ackThenSettle({ ok: true, sfxEvent })
    if (!deferDayVoteAchievement(gameId, dayIndex, uuid)) gameAchievementService.evaluateForUsers([uuid], gameId)
}

module.exports = {
    handleSubmitDayVote,
}
