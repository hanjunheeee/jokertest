// 판 업적 손잡이 파일, 낮 투표 참여 기록 저장 + 여러 명 업적 평가(사람마다 따로 실패 처리)
// socket/gameSession/handlers/dayVote.js·services/game/record/persist.js가 부름, socket/gameSession.js는 시험 손잡이만
const voteParticipationRepository = require('../../repositories/game/voteParticipation')
const achievementService = require('../achievement')

// 바깥 함수 참조 묶음 (시험이 가짜로 갈아끼움, 불 때마다 이 칸을 읽음)
// preloadAchievements = 여러 명 진행 값·받은 목록 한 번에 읽기, 평가 함수를 시험이 바꾸면 같이 꺼짐 (가짜 평가가 DB 안 읽게)
const deps = {
    recordVoteParticipation: voteParticipationRepository.recordValidDayVoteParticipation,
    evaluateAchievements: achievementService.evaluateAndGrantForUser,
    preloadAchievements: achievementService.preloadForUsers,
}

// 1라운드 진짜 표 참여 기록 저장, Promise 그대로 넘김 (dayVote가 기다렸다 답함, 지도 04-③)
function recordParticipation(entry) {
    const record = deps.recordVoteParticipation
    return record(entry)
}

// 사람마다 평가: 한 사람 실패가 다른 사람·뒤 신호를 막지 않게 사람마다 catch (지도 07-⑥)
function evaluateEach(userIds, gameId, preloadedByUser) {
    const evaluate = deps.evaluateAchievements
    return Promise.all(userIds.map((userId) => {
        // 바로 부름 (전처럼 평가 시작이 한 칸 안 밀리게), 바로 던져도 실패 Promise로
        let pending
        try {
            pending = Promise.resolve(evaluate(userId, preloadedByUser?.get(userId)))
        } catch (error) {
            pending = Promise.reject(error)
        }
        // 실패는 기록만, 다른 사람 평가는 계속
        return pending.catch(() => {
            console.error('[업적 평가 실패]', { code: 'ACHIEVEMENT_EVAL_ERROR', gameId, userId })
        })
    }))
}

// 여러 명 업적 평가: 진행 값·받은 목록을 전원 한 번에 읽고 사람마다 평가 (사람마다 질의 3개 → 전원 3개)
// 한 번에 읽기 실패면 사람마다 읽음 (전과 같음), 묶은 Promise는 거부 안 됨 (persist.js가 그 뒤 캐시 신호 보냄)
function evaluateForUsers(userIds, gameId) {
    // 계정 id 아닌 값은 건너뜀
    const validIds = userIds.filter((userId) => typeof userId === 'string' && userId.length > 0)
    const preload = deps.preloadAchievements
    if (typeof preload !== 'function' || validIds.length === 0) return evaluateEach(validIds, gameId, null)
    return Promise.resolve()
        .then(() => preload(validIds))
        .catch(() => {
            console.error('[업적 미리 읽기 실패]', { code: 'ACHIEVEMENT_PRELOAD_ERROR', gameId })
            return null
        })
        .then((preloadedByUser) => evaluateEach(validIds, gameId, preloadedByUser))
}

// 시험용: 투표 참여 저장 함수 갈아끼우기 (없으면 원래 것)
function __setRecordVoteParticipationForTests(fn) {
    deps.recordVoteParticipation = fn ?? voteParticipationRepository.recordValidDayVoteParticipation
}

// 시험용: 업적 평가 함수 갈아끼우기 (없으면 원래 것)
function __setEvaluateAchievementsForTests(fn) {
    deps.evaluateAchievements = fn ?? achievementService.evaluateAndGrantForUser
    deps.preloadAchievements = fn ? null : achievementService.preloadForUsers
}

module.exports = {
    recordParticipation,
    evaluateForUsers,
    __setRecordVoteParticipationForTests,
    __setEvaluateAchievementsForTests,
}
