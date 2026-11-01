// refresh 저장소 파일, refresh 해시로 세션 찾기 · 회전 결과 저장
// user/index.js가 묶어 내보냄, refresh 서비스가 트랜잭션 안에서 부름
const db              = require("../../models");
const { Op }          = db.Sequelize;

// 지금 해시·직전 해시로 세션 찾고, 없으면 옛 해시 기록으로 찾음 (옛 토큰 재사용 알아채기용)
exports.findSessionForRefresh = async (hash, options = {}) => {
    const { transaction } = options;
    if (!hash) return null;

    // 트랜잭션 안이면 세션 행 잠금 (같은 토큰 동시 회전 막기)
    const lock = transaction ? transaction.LOCK.UPDATE : undefined;
    const direct = await db.UserSession.findOne({
        where: {
            [Op.or]: [
                { refresh_token_hash: hash },
                { refresh_previous_hash: hash },
            ],
        },
        transaction,
        lock,
    });
    if (direct) return direct;

    // 더 옛 해시는 refresh_token_history에만 있음 (모델 없이 쿼리)
    const [historyRows] = await db.sequelize.query(
        'SELECT session_id FROM refresh_token_history WHERE token_hash = :hash LIMIT 1',
        { replacements: { hash }, transaction },
    );
    const historyMatch = historyRows[0];
    if (!historyMatch) return null;

    return await db.UserSession.findOne({
        where: { id: historyMatch.session_id },
        transaction,
        lock,
    });
};

// 새 해시 넣고 지금 해시는 직전 칸으로(유예 시각까지), 직전 칸에서 밀려난 해시는 기록 표에 남김
exports.applyRefreshRotation = async (sessionId, { newHash, previousHash, previousExpiresAt, evictedHash }, options = {}) => {
    const { transaction } = options;
    // 처음 회전이면 밀려난 해시 없음
    if (evictedHash) {
        await db.sequelize.query(
            'INSERT INTO refresh_token_history (session_id, token_hash, created_at) VALUES (:sessionId, :hash, NOW())',
            { replacements: { sessionId, hash: evictedHash }, transaction },
        );
    }
    return await db.UserSession.update(
        {
            refresh_token_hash: newHash,
            refresh_previous_hash: previousHash,
            refresh_previous_expires_at: previousExpiresAt,
        },
        { where: { id: sessionId }, ...options }
    );
};
