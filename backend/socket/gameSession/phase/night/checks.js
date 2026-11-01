// 밤 run 판정 파일
// 지금 밤 run·대기 표인지 + 보내기·기다리기 직전 그 사람 자격 다시 보기, 밤 턴·연출 대기·성공 전달이 씀
const { isNonEmptyString } = require('../../../common/shape')
const { NIGHT_TURN_STAGES } = require('../../core/constants')
const { nightTurnRuns } = require('../../core/state')
const { isCurrentSocketForUuid, getSocketForUuid } = require('../../connection/ownership')
const {
    isEligibleRecipient,
    isSessionOnlyRecipient,
    hasOutsideMembership,
} = require('../../delivery/eligibility')

// 이 run이 아직 그 판의 지금 밤 run인지 (늦게 온 옛 타이머 거르기, 지도 05-⑩)
function isCurrentNightRun(run) {
    return nightTurnRuns.get(run.session.id) === run
}

// 그 역할 턴이 아직 제출 받는 중인지 (이미 닫힌 턴을 또 닫지 않게)
function isSubmittingNightTurn(run, role) {
    if (!isCurrentNightRun(run)) return false
    if (run.session.nightTurnRole !== role) return false
    return run.stage === NIGHT_TURN_STAGES.SUBMITTING
}

// 연출 대기 표가 지금 run의 지금 대기인지 (턴 바뀜·멈춤·새 대기면 옛 표, 지도 05-⑨)
function isCurrentWaitToken(run, token) {
    // 이 run·이 판·이 밤에 만든 표고 run도 아직 지금 것인지
    if (!run || !token) return false
    if (token.run !== run) return false
    const { session } = run
    if (token.session !== session) return false
    if (!isCurrentNightRun(run)) return false
    if (token.gameId !== session.id) return false
    if (token.nightDayIndex !== run.nightDayIndex) return false
    // 아직 대기 단계고 지금 걸린 그 표인지
    if (run.stage !== NIGHT_TURN_STAGES.PRESENTATION_WAIT) return false
    return run.wait === token
}

// 보내기 직전 다시 봄: 그 계정의 지금 소켓·같은 자리·받을 자격·다른 소속 없음 (지도 05-⑧)
function isStillDeliverableTo(io, session, socket, uuid, membershipId) {
    if (socket.data?.user?.uuid !== uuid) return false
    if (!isCurrentSocketForUuid(uuid, socket, io)) return false
    if ((session.players.get(uuid)?.membershipId ?? null) !== membershipId) return false
    return isSessionOnlyRecipient(session, socket, uuid)
}

// 기다릴 사람이 지금도 같은 자리로 연결돼 받을 수 있는지 (끊김·나감·다른 판이면 기다림에서 뺌)
function isEligibleForWait(run, session, uuid, membershipId) {
    if (!isNonEmptyString(uuid)) return false
    if ((session.players.get(uuid)?.membershipId ?? null) !== membershipId) return false
    const socket = getSocketForUuid(run.io, uuid)
    if (!socket) return false
    if (!isEligibleRecipient(session, socket, uuid)) return false
    return !hasOutsideMembership(session, uuid)
}

module.exports = {
    isCurrentNightRun,
    isSubmittingNightTurn,
    isCurrentWaitToken,
    isStillDeliverableTo,
    isEligibleForWait,
}
