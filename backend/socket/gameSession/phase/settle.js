// 다 차면 5초 뒤 판정 파일
// 표·밤 행동이 다 찬 단계의 마감을 지금+5초로 당기기 + 판에 당김 표시 적기 + 판 전원에게 당긴 마감 알림, 낮·재판 타이머·밤 턴이 씀
// 판정은 원래 마감 길 그대로 씀 (새 판정 길이 없어 겹친 판정·멈춤 위험이 안 늘어남)
const { isolate } = require('../../common/isolate')
const { clearRunTimer } = require('../core/timers')
const { emitToGameChannel } = require('../delivery/broadcast')

// 다 찬 뒤 판정까지 5초 (시험은 run에 settleDelayMs를 넣어 줄임)
const SETTLE_DELAY_MS = 5000

// 마감 당김 알림 사건 이름 (화면이 그 단계 마감 시각을 바꾸고 "5초 뒤 마감" 보임)
const PHASE_SETTLE_STARTED_EVENT = 'phase_settle_started'

// run에 넣은 시험 값 먼저, 없거나 이상하면 5초
function resolveSettleDelayMs(run) {
    const injected = run?.settleDelayMs
    return Number.isInteger(injected) && injected > 0 ? injected : SETTLE_DELAY_MS
}

// 낼 사람 전원이 냈는지 (낼 사람 0명이면 다 찬 것으로 안 봄, 원래 마감에 맡김)
function hasAllSubmitted(voterUuids, hasSubmitted) {
    if (!Array.isArray(voterUuids) || voterUuids.length === 0) return false
    return voterUuids.every((voterUuid) => hasSubmitted(voterUuid))
}

// 마감 당기기: 이 단계에서 처음이고 남은 시간이 5초보다 길 때만 옛 타이머 끄고 run 마감을 지금+5초로
// 당겼으면 { deadline, delayMs }, 아니면 null (새 타이머는 부른 쪽이 검, 단계마다 마감 함수가 다름)
// 한 단계에 한 번만: 5초 안에 표를 바꿔 다시 불려도 안 늘림
function pullRunDeadline(run, stepKey) {
    if (!run || run.settledStep === stepKey) return null
    const delayMs = resolveSettleDelayMs(run)
    const now = run.nowFn()
    if (!Number.isFinite(run.deadline) || run.deadline - now <= delayMs) return null
    clearRunTimer(run)
    run.settledStep = stepKey
    run.deadline = now + delayMs
    return { deadline: run.deadline, delayMs }
}

// 판 전원에게 당긴 마감 알림, 던져도 타이머는 그대로 돎
// 예 { gameId, phase: 'NIGHT', dayIndex: 1, role: 'JOKER', deadline: 1763280005000 } (낮·재판은 role null)
function announceSettleStarted(run, phase, role = null) {
    const { session } = run
    // 판에도 "지금 당김 중" 표시 적어 둠 (새로고침 스냅샷이 "5초 뒤 마감" 글·시간 바 펼침을 살림)
    // 단계가 넘어가도 안 지움: 스냅샷이 단계·날짜·직업·마감이 지금과 같을 때만 실음
    session.phaseSettle = { phase, dayIndex: session.dayIndex, role, deadline: run.deadline }
    const payload = { gameId: session.id, phase, dayIndex: session.dayIndex, role, deadline: run.deadline }
    isolate('[마감 당김 방송 실패]', { code: 'DELIVERY_ERROR', event: PHASE_SETTLE_STARTED_EVENT, gameId: session.id },
        () => emitToGameChannel(run.io, session, PHASE_SETTLE_STARTED_EVENT, payload))
}

module.exports = {
    SETTLE_DELAY_MS,
    PHASE_SETTLE_STARTED_EVENT,
    resolveSettleDelayMs,
    hasAllSubmitted,
    pullRunDeadline,
    announceSettleStarted,
}
