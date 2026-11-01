// 세션 저장소 파일, 세션 만들기 · 살아 있는 세션 찾기 · 그 사람 세션 전부 끊기 · 로그아웃 기록
// user/index.js 거쳐 로그인·refresh·비번·세션 확인·소셜 연결 서비스가 씀
const db              = require("../../models");

// 세션 한 줄
exports.createUserSession = async (sessionData, options = {}) => {
    return await db.UserSession.create(sessionData, options);
};

// 접속 중이고 폐기 안 된 그 사람 세션 (토큰 속 세션 id가 아직 살아 있는지)
exports.findActiveSession = async (id, user_id) => {
    // id나 사람 없으면 DB 안 가고 없음
    if (!id || !user_id) return null;
    return await db.UserSession.findOne({
        where:      { id, user_id, is_online: true, revoked_at: null },
        attributes: ['id', 'user_id', 'is_online', 'revoked_at', 'refresh_token_expires_at'],
    });
};

// 그 사람 안 끊긴 세션 전부 끊고 폐기 표시 (새 로그인·비번 변경·정지·refresh 재사용 때)
exports.markOnlineSessionsOffline = async (user_id, options = {}) => {
    return await db.UserSession.update(
        { is_online: false, revoked_at: new Date() },
        { where: { user_id, revoked_at: null }, ...options }
    );
};

// 마지막 성공 로그인 기록에 로그아웃 시각 + 그 세션 끊기
exports.recordLogout = async (user_id, session_id) => {
    const lastLogin = await db.LoginHistory.findOne({
        where: { user_id, success: true, logout_at: null },
        order: [['login_at', 'DESC']],
    });
    // 로그아웃 시각 안 찍힌 기록이 있을 때만
    if (lastLogin) {
        await lastLogin.update({ logout_at: new Date() });
    }
    await db.UserSession.update(
        { is_online: false, revoked_at: new Date() },
        { where: { id: session_id, user_id, is_online: true } }
    );
};
