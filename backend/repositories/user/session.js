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
        // 계정 상태도 같은 쿼리로 (ACTIVE 아니면 세션 확인이 끊음, 따로 DB 안 감)
        include: [{ model: db.User, attributes: ['status'], required: false }],
    });
};

// 그 사람 안 끊긴 세션 전부 끊고 폐기 표시 (새 로그인·비번 변경·정지·refresh 재사용 때)
// 안 잠그는 읽기로 세션 id 찾고 id로만 끊음 (2026-11-09 동시 첫 로그인 교착)
// user_id로 바로 UPDATE하면 빈 틈·남의 줄까지 잠가 다른 사람 새 세션 넣기와 서로 막힘
// 같은 사람 동시 처리는 부르는 쪽이 users 행을 먼저 잠가 줄 세움 (그래서 읽기가 늦게 커밋된 줄도 봄)
exports.markOnlineSessionsOffline = async (user_id, options = {}) => {
    const { transaction, logging } = options;
    const readOptions = { where: { user_id, revoked_at: null }, attributes: ['id'], raw: true, transaction };
    if (logging !== undefined) readOptions.logging = logging;
    const rows = await db.UserSession.findAll(readOptions);
    // 끊을 것 없으면 UPDATE 안 함 (빈 사람 첫 로그인)
    if (rows.length === 0) return [0];
    return await db.UserSession.update(
        { is_online: false, revoked_at: new Date() },
        { where: { id: rows.map((row) => row.id), revoked_at: null }, ...options }
    );
};

// 그 세션 끊고, 끊긴 게 있을 때만 마지막 성공 로그인 기록에 로그아웃 시각
// 이미 끊긴 옛 세션 로그아웃이 새 기기 로그인 기록을 닫지 않게 (한 사람 한 세션이라 마지막 기록이 지금 세션 것)
exports.recordLogout = async (user_id, session_id) => {
    const [revokedCount] = await db.UserSession.update(
        { is_online: false, revoked_at: new Date() },
        { where: { id: session_id, user_id, is_online: true } }
    );
    if (!revokedCount) return;

    const lastLogin = await db.LoginHistory.findOne({
        where: { user_id, success: true, logout_at: null },
        order: [['login_at', 'DESC']],
    });
    // 로그아웃 시각 안 찍힌 기록이 있을 때만
    if (lastLogin) {
        await lastLogin.update({ logout_at: new Date() });
    }
};
