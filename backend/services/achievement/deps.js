'use strict';

// 업적 주입 파일, db·전적 통계·투표 저장소·경제·전송·알림 묶음
// evaluate·grant·progress·testing이 씀, 묶음을 통째로 바꾸므로 getDeps()로 매번 읽음

// 시험 주입 먼저, 없으면 진짜 것 (전부 늦은 require라 불러오기 순환 없음)
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../../repositories/common/db'); },
    // 업적 진행 셈은 전적 통계(game/roleStatistics/queries.js) 몫, 칸 이름은 시험 주입 이름 맞추려고 그대로 둠
    get gameResultRepository() { return overrides.gameResultRepository ?? require('../game/roleStatistics/queries'); },
    get voteParticipationRepository() { return overrides.voteParticipationRepository ?? require('../../repositories/game/voteParticipation'); },
    get economyService() { return overrides.economyService ?? require('../economy'); },
    // 전송 창구 못 불러오면 null, 지급 통지만 건너뜀
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

// 주입 묶음 갈아 끼우기 (시험 손잡이 testing.js가 부름)
const setDeps = (next) => {
    deps = next;
};

module.exports = {
    buildDeps,
    getDeps,
    setDeps,
};
