// refresh 저장소 파일, refresh 해시로 세션 찾기 · 회전 결과 저장
// refresh 서비스가 트랜잭션 안에서 부름
const db              = require("../../models");
const { Op }          = db.Sequelize;

// 지금 해시나 직전 해시로 세션 찾고 잠금
exports.findSessionForRefresh = async (hash, options = {}) => {
    const { transaction } = options;
    if (!hash) return null;

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

// 새 해시 넣고 직전 해시는 유예 시간까지, 밀려난 해시는 기록
exports.applyRefreshRotation = async (sessionId, { newHash, previousHash, previousExpiresAt, evictedHash }, options = {}) => {
    const { transaction } = options;
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
