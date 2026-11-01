'use strict';

// 업적 주입 파일, db·전적·투표 저장소·경제·전송·알림 꺼내는 묶음
// 묶음은 다시 대입되므로 다른 파일은 getDeps()로 매번 읽음

// 시험 주입 먼저, 없으면 진짜 것 (전부 늦은 require라 load 순환 없음)
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../../models'); },
    get gameResultRepository() { return overrides.gameResultRepository ?? require('../../repositories/gameResult.repositories'); },
    get voteParticipationRepository() { return overrides.voteParticipationRepository ?? require('../../repositories/voteParticipation.repositories'); },
    get economyService() { return overrides.economyService ?? require('../economy'); },
    get emitToUser() {
        if (overrides.emitToUser) return overrides.emitToUser;
        try {
            return require('../../socket/emitter').emitToUser;
        } catch {
            return null;
        }
    },
    get notificationService() { return overrides.notificationService ?? require('../notification'); },
});

// 지금 쓰는 주입 묶음
let deps = buildDeps();

// 지금 주입 묶음 꺼내기 (시험이 바꿔 끼운 뒤에도 새 묶음 보이게)
const getDeps = () => deps;

// 주입 묶음 갈아 끼우기 (시험 손잡이가 부름)
const setDeps = (next) => {
    deps = next;
};

module.exports = {
    buildDeps,
    getDeps,
    setDeps,
};
