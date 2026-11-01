// 밤 마무리 파일
// 밤 결과 확정·낮 타이머·결과 전달을 한 관문으로 (같은 밤 두 번 확정 막기), 밤 턴·밤 종료 버튼이 씀
const gameSessionCore = require('../../../../game-core/gameSession')
const { isNonEmptyString } = require('../../../common/shape')
const { isolate, isolateOr } = require('../../../common/isolate')
const { rejectedReply, internalErrorReply } = require('../../../common/replies')
const { NIGHT_INTERNAL_CODES } = require('../../core/constants')
const { nightFinalizeInFlight } = require('../../core/state')
const { stillEligible, hasOutsideMembership } = require('../../delivery/eligibility')
const { resolveSessionSockets, resolveOrEmpty } = require('../../delivery/broadcast')
const { isNightPresentationWaitActive } = require('./wait')
const { stopNightTurnSequence } = require('./turn')
const { startDayPhaseTimer } = require('../day')
const { withTerminalFields } = require('../../departure/end')

// 밤 마무리 관문: 자동 마무리·'밤 종료' 버튼 둘 다 여기로 모음, 같은 밤 두 번 확정 못 함 (지도 06-④⑤)
function finalizeNightForSession(io, session, { prepared = null, deps = {}, onResult = null } = {}) {
    const prepareForSession = deps.prepareForSession ?? gameSessionCore.prepareNightResolutionForSession
    const commit = deps.commit ?? gameSessionCore.commitNightResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionSockets
    const label = '[밤 행동 판정 오류]'

    const gameId = session?.id
    if (!isNonEmptyString(gameId)) return { ok: false, code: 'SESSION_NOT_FOUND' }
    if (isNightPresentationWaitActive(gameId)) return { ok: false, code: 'ACTIONS_PENDING' }
    if (nightFinalizeInFlight.has(gameId)) return { ok: false, code: 'NIGHT_FINALIZE_IN_PROGRESS' }

    nightFinalizeInFlight.add(gameId)
    try {
        let resolvedPrepared = prepared
        if (!resolvedPrepared) {
            try {
                resolvedPrepared = prepareForSession(session)
            } catch {
                console.error(label, { code: 'PREPARE_UNEXPECTED_ERROR', uuid: undefined, gameId })
                return { ok: false, code: 'INTERNAL_ERROR' }
            }
        }
        if (!resolvedPrepared || resolvedPrepared.ok !== true) {
            return { ok: false, code: resolvedPrepared?.code ?? 'INTERNAL_ERROR' }
        }

        const targetSession = resolvedPrepared.session ?? session
        const resolution = resolvedPrepared.resolution
        // 여기서부터 로그엔 버튼 누른 사람(자동이면 undefined)·확정할 판 id
        const fields = { uuid: onResult?.uuid, gameId: targetSession.id }

        // 확정 실패: 내부 코드는 숨기고 INTERNAL_ERROR (지도 06-⑨)
        const failCommit = () => {
            console.error(label, { code: 'COMMIT_ERROR', ...fields })
            if (onResult) onResult(internalErrorReply())
            return { ok: false, code: 'INTERNAL_ERROR' }
        }
        let applied
        try {
            applied = commit(targetSession, resolution)
        } catch {
            return failCommit()
        }
        if (!applied.ok) {
            if (NIGHT_INTERNAL_CODES.has(applied.code)) return failCommit()
            if (onResult) onResult(rejectedReply(applied.code))
            return { ok: false, code: applied.code }
        }

        // 여기부터 진짜 바뀜 (확정됨): 뒤 실패는 로그만, 되돌리지 않음
        const appliedPayload = isolateOr(null, label, { code: 'PAYLOAD_BUILD_ERROR', ...fields },
            () => gameSessionCore.buildNightResultAppliedPayload(
                targetSession,
                applied.victimUuid,
                resolution.publicDeathReveals,
            ))
        const nightResultAppliedPayload = withTerminalFields(targetSession, applied.terminal, appliedPayload, label, fields)

        if (onResult) onResult(nightResultAppliedPayload ? { ok: true } : internalErrorReply())

        isolate(label, { code: 'TIMER_SYNC_ERROR', ...fields }, () => {
            stopNightTurnSequence(targetSession.id)
            startDayPhaseTimer(io, targetSession)
        })

        // 소켓마다 하나씩: 판정 끝 → 내 개인 결과(있으면) → 공개 결과 (지도 06-⑧)
        const recipients = resolveOrEmpty(io, targetSession, label, fields, resolveParticipantSockets)
        for (const recipientSocket of recipients) {
            if (!stillEligible(targetSession, recipientSocket)) continue
            const recipientUuid = recipientSocket.data?.user?.uuid ?? null
            if (recipientUuid !== null && hasOutsideMembership(targetSession, recipientUuid)) continue

            isolate(label, { code: 'DELIVERY_ERROR', ...fields },
                () => recipientSocket.emit('night_actions_resolved', { gameId: targetSession.id, dayIndex: resolution.dayIndex }))

            const privateResult = resolution.privateResults?.get(recipientUuid)
            if (privateResult !== undefined) {
                isolate(label, { code: 'PRIVATE_DELIVERY_ERROR', ...fields },
                    () => recipientSocket.emit('night_action_result', {
                        gameId: targetSession.id,
                        dayIndex: resolution.dayIndex,
                        ...privateResult,
                        sfxEvent: {
                            eventId: `game:${targetSession.id}:night:${resolution.dayIndex}:${privateResult.actionType}`,
                            accountId: recipientUuid,
                            gameId: targetSession.id,
                            origin: 'live',
                        },
                    }))
            }

            if (nightResultAppliedPayload) {
                isolate(label, { code: 'DELIVERY_ERROR', ...fields },
                    () => recipientSocket.emit('night_result_applied', nightResultAppliedPayload))
            }
        }

        return { ok: true, victimUuid: applied.victimUuid, terminal: applied.terminal ?? null }
    } finally {
        nightFinalizeInFlight.delete(gameId)
    }
}

module.exports = {
    finalizeNightForSession,
}
