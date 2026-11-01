// 밤 입구, 밤 폴더 파일 전부 묶어서 내보냄
// gameSession.js·끊김 탈락·판 만들기·스냅샷이 여기서 가져다 씀
// 밤 순서·시간·판정 방식 같은 고정 값
const {
    NIGHT_TURN_ORDER, NIGHT_TURN_DURATION_MS, NIGHT_ACTION_RESOLUTION_POLICY, NIGHT_RECOVERY_STATES,
    EMPTY_COMPLETED_ROLES, SELF_TARGET_ROLES, PUBLIC_NIGHT_DEATH_SOURCES,
} = require('./constants')
// 누가 행동할 수 있는지, 차례 순서
const {
    isEligibleForNightAction, requiresAliveTarget, matchesTargetLifeRule,
    getEligibleNightActorUuids, getAliveActorUuidsForRole, getNightTurnOrder, isRoleTurnComplete,
    getCurrentNightTurnRole,
} = require('./actors')
// 역할별로 끝났는지 적는 진행 기록
const {
    isRecoveryBlockedState, createNightProgress, matchesCurrentNight, getNightProgress,
    ensureNightProgress, markNightSequenced, isNightRoleCompleted,
} = require('./progress')
// 역할 차례 시작·확정·끝
const {
    collectRoleNightSubmissions, resolveRoleNightAction, findInvalidSubmission,
    computeNightRoleStep, closeNightHealing, applyNightRoleStep, completeNightRole,
} = require('./roleStep')
// 밤 행동 대상 받기
const { submitNightAction } = require('./submit')
// 판정 준비 출처 대장 (prepare가 만든 것만 commit)
const {
    nightPreparations, computeFingerprint, deepClone,
    snapshotNightPreparation, restoreNightPreparation, registerNightPreparation,
} = require('./ledger')
// 밤 판정 준비: 누가 죽나 계산만
const { prepareNightResolution, prepareNightResolutionForSession } = require('./prepare')
// 밤 판정 확정: 진짜 죽이고 낮으로
const { expireDeadPlayerNightEffects, commitNightResolution } = require('./commit')
// 밤 방송 내용·사망 공개 목록
const {
    buildNightTurnStartedPayload, buildNightTurnEndedPayload, buildAssassinationFailureNotice,
    buildNightResultAppliedPayload, resolveNightDeathSource, buildNightDeathReveals,
} = require('./payloads')

module.exports = {
    NIGHT_TURN_ORDER, NIGHT_TURN_DURATION_MS, NIGHT_ACTION_RESOLUTION_POLICY, NIGHT_RECOVERY_STATES,
    EMPTY_COMPLETED_ROLES, SELF_TARGET_ROLES, PUBLIC_NIGHT_DEATH_SOURCES,
    isEligibleForNightAction, requiresAliveTarget, matchesTargetLifeRule,
    getEligibleNightActorUuids, getAliveActorUuidsForRole, getNightTurnOrder, isRoleTurnComplete,
    getCurrentNightTurnRole,
    isRecoveryBlockedState, createNightProgress, matchesCurrentNight, getNightProgress,
    ensureNightProgress, markNightSequenced, isNightRoleCompleted,
    collectRoleNightSubmissions, resolveRoleNightAction, findInvalidSubmission,
    computeNightRoleStep, closeNightHealing, applyNightRoleStep, completeNightRole,
    submitNightAction,
    nightPreparations, computeFingerprint, deepClone,
    snapshotNightPreparation, restoreNightPreparation, registerNightPreparation,
    prepareNightResolution, prepareNightResolutionForSession,
    expireDeadPlayerNightEffects, commitNightResolution,
    buildNightTurnStartedPayload, buildNightTurnEndedPayload, buildAssassinationFailureNotice,
    buildNightResultAppliedPayload, resolveNightDeathSource, buildNightDeathReveals,
}
