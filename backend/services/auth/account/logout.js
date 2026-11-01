// 로그아웃 파일, 로그아웃 기록 남기고 그 세션 끊기
// 세션 컨트롤러가 부름 (저장소는 모듈 객체로 불러 시험 패치 그대로 먹게)
const userRepository = require("../../../repositories/user.repositories");

// 마지막 로그인 기록에 로그아웃 시각 + 그 세션 끊기
exports.logout = async ({ uuid, sessionId }) => {
    await userRepository.recordLogout(uuid, sessionId);
};
