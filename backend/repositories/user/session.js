// 세션 저장소 파일, 세션 만들기·살아 있는 세션 찾기 · 접속 세션 끊기 · 로그아웃 기록
// 로그인·refresh·비번 변경·소켓 세션 감시가 부름
const db              = require("../../models");

// 세션 한 줄
exports.createUserSession = async (sessionData, options = {}) => {
    return await db.UserSession.create(sessionData, options);
};

// 폐기 안 된 그 사람 세션
exports.findActiveSession = async (id, user_id) => {
    if (!id || !user_id) return null;
    return await db.UserSession.findOne({
        where:      { id, user_id, is_online: true, revoked_at: null },
        attributes: ['id', 'user_id', 'is_online', 'revoked_at', 'refresh_token_expires_at'],
    });
};

// 그 사람 접속 세션 전부 끊고 폐기 표시
exports.markOnlineSessionsOffline = async (user_id, options = {}) => {
    return await db.UserSession.update(
        { is_online: false, revoked_at: new Date() },
        { where: { user_id, revoked_at: null }, ...options }
    );
};

// 마지막 로그인 기록에 로그아웃 시각 + 그 세션 끊기
exports.recordLogout = async (user_id, session_id) => {
    const lastLogin = await db.LoginHistory.findOne({
        where: { user_id, success: true, logout_at: null },
        order: [['login_at', 'DESC']],
    });
    if (lastLogin) {
        await lastLogin.update({ logout_at: new Date() });
    }
    await db.UserSession.update(
        { is_online: false, revoked_at: new Date() },
        { where: { id: session_id, user_id, is_online: true } }
    );
};
