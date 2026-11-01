// 판 중 업적 평가 파일
// 업적 평가 묶음(사람마다 따로 실패 처리) + 낮 투표 참여 기록 저장, socket gameSession·전적 저장이 부름
const voteParticipationRepository = require('../../repositories/voteParticipation.repositories')
const achievementService = require('../achievementService')

// 바깥 함수 참조 묶음 (시험이 가짜로 갈아끼움, 불 때마다 이 칸을 읽음)
const deps = {
    recordVoteParticipation: voteParticipationRepository.recordValidDayVoteParticipation,
    evaluateAchievements: achievementService.evaluateAndGrantForUser,
}

// 1라운드 진짜 표의 참여 기록 저장 (돌려받은 Promise를 그대로 넘김, 지도 04-③)
function recordDayVoteParticipation(entry) {
    const record = deps.recordVoteParticipation
    return record(entry)
}

// 여러 명 업적 평가: 한 사람 실패가 다른 사람·뒤 신호를 막지 않게 사람마다 catch (지도 07-⑥)
// 묶은 Promise는 거부되지 않음
function evaluateAchievementsForUsers(userIds, gameId) {
    const settled = []
    for (const userId of userIds) {
        if (typeof userId !== 'string' || !userId) continue
        const evaluate = deps.evaluateAchievements
        settled.push(
            Promise.resolve(evaluate(userId))
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
    recordDayVoteParticipation,
    evaluateAchievementsForUsers,
    __setRecordVoteParticipationForTests,
    __setEvaluateAchievementsForTests,
}
