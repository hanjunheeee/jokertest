// 참가자 이탈 반영 파일
// 이탈 커밋 뒤 방송·유예·탈주 기록·전적 + 막혀 있던 단계 풀기(표가 다 차면 5초 뒤 판정), 나가기·끊김 유예 만료가 씀
// + 새 판 시작 때 옛 판에서 뺀 죽은 사람 알리기 (matchmaking 시작 처리가 gameSession.js 통해 부름)
const gameSessionCore = require('../../../game-core/gameSession')
const { getSessionById } = require('../../../game-core/queries/byId')
const { persistTerminalSession } = require('../../../services/game/record')
const { recordDesertion, DESERTION_REASONS } = require('../../../services/game/desertion')
const { isolate, isolateOr } = require('../../common/isolate')
const { cancelDisconnectGrace } = require('../connection/grace')
const { emitToGameChannel, detachFromGameChannel } = require('../delivery/broadcast')
const { emitSelfProgress } = require('../delivery/progress')
const { settleNightTurnIfComplete } = require('../phase/night/turn')
const { startDayPhaseTimer, syncSessionPhaseTimers, settleDayVoteIfComplete } = require('../phase/day')
const { settleTribunalIfComplete } = require('../phase/tribunal')
const { stopRoleRevealTimer } = require('../phase/roleReveal')
const { scheduleEndedSweep, markChatEnded } = require('./end')

// 탈주로 적는 이탈 이유: 산 채로 나가기·끊긴 뒤 60초 못 돌아옴 (죽은 뒤 나감·점검·결과 화면 나가기는 여기 안 옴, 결정 "탈주 벌" ①②)
const DESERTION_REASON_BY_DEPARTURE = Object.freeze({
    PLAYER_LEFT: DESERTION_REASONS.LEFT_ALIVE,
    DISCONNECT_GRACE_EXPIRED: DESERTION_REASONS.DISCONNECT_TIMEOUT,
})

// 참가자 이탈 반영: core 커밋 뒤 단계는 하나씩 격리, 커밋은 되돌리지 않음 (지도 12-⑦⑧⑨⑩)
function applyParticipantDeparture(io, session, uuid, { reason = 'PARTICIPANT_LEFT' } = {}) {
    const label = '[참가자 이탈 처리 실패]'
    // 커밋이 던지면 뒤 방송·판정 안 하고 INTERNAL_ERROR
    let applied
    try {
        applied = gameSessionCore.commitParticipantDeparture(session, uuid, { reason })
    } catch {
        console.error(label, { code: 'COMMIT_ERROR', uuid, gameId: session?.id })
        return { ok: false, code: 'INTERNAL_ERROR' }
    }
    // core 거절(이미 나감·끝난 판 등)은 그대로 돌려줌
    if (!applied.ok) return applied

    // 여기부터 진짜 바뀜 (이미 커밋됨): 뒤 단계 실패는 로그만
    const step = (code, run) => isolate(label, { code, uuid, gameId: session.id }, run)

    // 끊김 유예 중이었으면 같이 끝냄 (유예 타이머가 두 번째 사망 시도 못 하게, 지도 12-⑦)
    step('GRACE_CANCEL_ERROR', () => cancelDisconnectGrace(session.id, uuid))

    // 산 채로 떠났으면 탈주 기록 (대기 시간 막힘은 부르는 순간 메모리에 걸림, DB 쓰기는 안 기다림·절대 안 던짐)
    // 60초 탈락은 정지 중인지 먼저 물어 정지면 안 적음 (services/game/desertion.js)
    const desertionReason = applied.wasAlive ? DESERTION_REASON_BY_DEPARTURE[reason] : undefined
    if (desertionReason) {
        step('DESERTION_RECORD_ERROR', () => {
            void recordDesertion({ userId: uuid, gameId: session.id, reason: desertionReason })
        })
    }

    // 사망 방송: 승부 났으면 종료 필드 실음 (만들다 던지면 거기까지 만든 내용으로 보냄)
    if (applied.eliminated) {
        let payload = null
        step('PAYLOAD_BUILD_ERROR', () => {
            payload = gameSessionCore.buildDisconnectPayload(session, applied.victimUuid)
            if (applied.terminal) {
                payload = { ...payload, ...gameSessionCore.buildTerminalFields(session) }
            }
            payload = {
                ...payload,
                sfxEvent: {
                    eventId: `game:${session.id}:day:${session.dayIndex}:victim:${applied.victimUuid}:eliminated`,
                    gameId: session.id,
                    origin: 'live',
                },
            }
        })
        if (payload) step('DELIVERY_ERROR', () => emitToGameChannel(io, session, 'player_eliminated', payload))
    }

    // 참여 변경 방송 (빠진 사람·방장·참여 번호), 만들다 던지면 안 보냄
    const participationPayload = isolateOr(null, label, { code: 'PARTICIPATION_PAYLOAD_BUILD_ERROR', uuid, gameId: session.id },
        () => gameSessionCore.buildParticipationChangedPayload(session, applied.victimUuid))
    if (participationPayload) {
        step('PARTICIPATION_DELIVERY_ERROR',
            () => emitToGameChannel(io, session, 'session_participation_changed', participationPayload))
    }

    // 기권 처리된 표는 각자에게만 (누가 누굴 찍었는지 안 새게), 던져도 뒷처리 계속
    step('SELF_PROGRESS_ERROR', () => emitSelfProgress(io, session))

    // 피고가 빠져 재판이 피고 사망으로 닫혔으면 그 결과 방송 (값 이름만 취소, 재판 취소 결과는 이제 안 만듦)
    if (applied.tribunalCancelled) {
        step('TRIBUNAL_CANCEL_ERROR',
            () => emitToGameChannel(io, session, 'tribunal_vote_resolved', gameSessionCore.buildTribunalVoteResolvedPayload(session)))
    }

    // 승부 났으면 전적 저장은 시작만 하고 타이머 정리 (지도 12-⑩)
    if (applied.terminal) {
        step('PERSIST_START_ERROR', () => persistTerminalSession(session, { completed: true }))
        step('CHAT_END_MARK_ERROR', () => markChatEnded(session))
        step('ENDED_SWEEP_SCHEDULE_ERROR', () => scheduleEndedSweep(io, session))
        step('ROLE_REVEAL_TIMER_STOP_ERROR', () => stopRoleRevealTimer(session.id))
        step('TIMER_SYNC_ERROR', () => syncSessionPhaseTimers(io, session))
        return applied
    }

    advanceAfterDeparture(io, session, applied)
    return applied
}

// 이탈로 막혀 있던 단계 풀기: 다 준비됐으면 다음 단계로, 남은 사람 다 냈으면 마감 5초로 당김 (판정은 마감이 함)
function advanceAfterDeparture(io, session, applied) {
    const label = '[이탈 후 단계 진행 실패]'
    // 단계마다 격리, 실패는 로그만
    const step = (code, run) => isolate(label, { code, gameId: session.id }, run)

    // 피고 사망으로 재판이 닫혔으면 core가 이미 밤으로 넘김, 타이머만 맞춤
    if (applied.tribunalCancelled) {
        step('TIMER_SYNC_ERROR', () => syncSessionPhaseTimers(io, session))
        return
    }

    // 남은 사람이 다 준비했으면 core가 다음 단계로 넘김 (역할 공개는 마감 타이머만 넘김)
    const advanced = isolateOr({ transitioned: null }, label, { code: 'ADVANCE_ERROR', gameId: session.id },
        () => gameSessionCore.advanceStalledPhase(session))

    // 토론 끝나 투표로: 투표 타이머 먼저 걸고 낮 단계 방송 (새 마감 시각 실으려고)
    if (advanced.transitioned === 'DAY_VOTE') {
        step('TIMER_START_ERROR', () => startDayPhaseTimer(io, session))
        step('DAY_PHASE_DELIVERY_ERROR',
            () => emitToGameChannel(io, session, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session)))
        return
    }

    // 낮 투표·재판 중이면 남은 사람이 다 냈는지 보고 마감 5초로 당김 (안 낸 사람이 나가 다 찬 경우도 5초 뒤)
    if (session.phase === 'DAY' && gameSessionCore.getDayPhase(session) === gameSessionCore.DAY_PHASES.VOTE) {
        step('DAY_VOTE_SETTLE_ERROR', () => settleDayVoteIfComplete(session.id))
        return
    }

    if (session.phase === 'TRIBUNAL') {
        step('TRIBUNAL_SETTLE_ERROR', () => settleTribunalIfComplete(session.id))
        return
    }

    // 밤: 지금 역할 남은 사람이 다 골랐으면 턴 마감 5초로 당김
    if (session.phase === 'NIGHT') {
        step('TURN_SETTLE_ERROR', () => settleNightTurnIfComplete(session.id))
    }
}

// 새 판 시작 때 진행 중 옛 판에서 뺀 죽은 사람 알리기 (빼기는 game-core setup/commit.js가 이미 함)
// released 예: [{ uuid: 'u3', gameId: 'g-old', departure: { ok: true, victimUuid: 'u3', hostChanged: true, ... } }]
// 그 사람 소켓 옛 판 채널 떼기 → 옛 판 사람들에게 참여 변경 (방장이 넘어갔으면 hostUuid가 새 방장, 나가기와 같은 모양)
// 죽은 사람이라 표·밤 차례가 없어 단계 풀기는 안 함, 하나 실패해도 다음 사람 계속
function announceSupersededDepartures(io, released, socketsByUuid) {
    const label = '[새 판 시작 옛 판 정리 실패]'
    for (const { uuid, gameId, departure } of Array.isArray(released) ? released : []) {
        const session = getSessionById(gameId)
        if (!session) continue
        const step = (code, run) => isolate(label, { code, uuid, gameId }, run)
        for (const s of socketsByUuid?.get?.(uuid) ?? []) {
            step('CHANNEL_DETACH_ERROR', () => detachFromGameChannel(s, uuid, session.channelId, label, { gameId }))
        }
        const payload = isolateOr(null, label, { code: 'PARTICIPATION_PAYLOAD_BUILD_ERROR', uuid, gameId },
            () => gameSessionCore.buildParticipationChangedPayload(session, departure?.victimUuid ?? uuid))
        if (payload) {
            step('PARTICIPATION_DELIVERY_ERROR',
                () => emitToGameChannel(io, session, 'session_participation_changed', payload))
        }
    }
}

module.exports = {
    applyParticipantDeparture,
    announceSupersededDepartures,
}
