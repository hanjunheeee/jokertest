// 판 업적 손잡이 파일, 낮 투표 참여 기록 저장 + 여러 명 업적 평가(사람마다 따로 실패 처리)
// socket/gameSession/handlers/dayVote.js·services/game/record/persist.js가 부름, socket/gameSession.js는 시험 손잡이만
const voteParticipationRepository = require('../../repositories/game/voteParticipation')
const achievementService = require('../achievement')

// 바깥 함수 참조 묶음 (시험이 가짜로 갈아끼움, 불 때마다 이 칸을 읽음)
const deps = {
    recordVoteParticipation: voteParticipationRepository.recordValidDayVoteParticipation,
    evaluateAchievements: achievementService.evaluateAndGrantForUser,
}

// 1라운드 진짜 표 참여 기록 저장, Promise 그대로 넘김 (dayVote가 기다렸다 답함, 지도 04-③)
function recordParticipation(entry) {
    const record = deps.recordVoteParticipation
    return record(entry)
}

// 여러 명 업적 평가: 한 사람 실패가 다른 사람·뒤 신호를 막지 않게 사람마다 catch (지도 07-⑥)
// 묶은 Promise는 거부 안 됨 (persist.js가 그 뒤 캐시 신호 보냄)
function evaluateForUsers(userIds, gameId) {
    const settled = []
    for (const userId of userIds) {
        // 계정 id 아닌 값은 건너뜀
        if (typeof userId !== 'string' || !userId) continue
        const evaluate = deps.evaluateAchievements
        settled.push(
            Promise.resolve(evaluate(userId))
                // 실패는 기록만, 다른 사람 평가는 계속
                .catch(() => {
                    console.error('[업적 평가 실패]', { code: 'ACHIEVEMENT_EVAL_ERROR', gameId, userId })
                }),
        )
    }
    return Promise.all(settled)
}

// 시험용: 투표 참여 저장 함수 갈아끼우기 (없으면 원래 것)
function __setRecordVoteParticipationForTests(fn) {
    deps.recordVoteParticipation = fn ?? voteParticipationRepository.recordValidDayVoteParticipation
}

// 시험용: 업적 평가 함수 갈아끼우기 (없으면 원래 것)
function __setEvaluateAchievementsForTests(fn) {
    deps.evaluateAchievements = fn ?? achievementService.evaluateAndGrantForUser
}

module.exports = {
    recordParticipation,
    evaluateForUsers,
    __setRecordVoteParticipationForTests,
    __setEvaluateAchievementsForTests,
}
