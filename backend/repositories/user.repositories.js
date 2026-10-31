const db              = require("../models");
const { Op }          = db.Sequelize;
const { createError } = require("../utils/appError");

const UNIQUE_CONFLICTS = [
    { field: "nickname", message: "이미 사용 중인 닉네임입니다." },
    { field: "email",    message: "이미 사용 중인 이메일입니다." },
    { field: "provider_subject", message: "이미 연결된 소셜 계정입니다." },
];

const toConflictError = (error) => {
    if (error?.name !== "SequelizeUniqueConstraintError") return error;

    const errorItems = Array.isArray(error.errors) ? error.errors : [];
    const fields     = error.fields ?? {};
    const hints      = [
        ...errorItems.map((item) => item?.path),
        ...(Array.isArray(fields) ? fields : Object.keys(fields)),
    ].filter(Boolean).map(String);

    const hit = UNIQUE_CONFLICTS.find(({ field }) => hints.some((hint) => hint.includes(field)));
    return createError(hit?.message ?? "이미 사용 중인 값입니다.", 409);
};

exports.withTransaction = async (work, options = {}) => {
    if (Object.keys(options).length === 0) {
        return await db.sequelize.transaction(work);
    }
    return await db.sequelize.transaction(options, work);
};

exports.findByEmail = async (email, options = {}) => {
    const { transaction, lock, logging } = options;
    const findOptions = { where: { email }, transaction, lock };
    if (logging !== undefined) findOptions.logging = logging;
    return await db.User.findOne(findOptions);
};

exports.findByNickname = async (nickname) => {
    return await db.User.findOne({ where: { nickname } });
};

exports.findByUuid = async (uuid, options = {}) => {
    const { transaction, lock, logging } = options;
    const findOptions = { where: { uuid }, transaction, lock };
    if (logging !== undefined) findOptions.logging = logging;
    return await db.User.findOne(findOptions);
};

exports.createUser = async (userData, options = {}) => {
    try {
        return await db.User.create(userData, options);
    } catch (error) {
        throw toConflictError(error);
    }
};

exports.updateUser = async (uuid, updateData, options = {}) => {
    try {
        return await db.User.update(updateData, { where: { uuid }, ...options });
    } catch (error) {
        throw toConflictError(error);
    }
};

exports.createUserStats = async (user_id, options = {}) => {
    return await db.UserStats.create({ user_id }, options);
};

exports.createLoginHistory = async (historyData, options = {}) => {
    return await db.LoginHistory.create(historyData, options);
};

exports.checkActiveBan = async (user_id) => {
    return await db.UserBan.findOne({
        where: {
            user_id,
            [Op.or]: [
                { is_permanent: true },
                { end_at: { [Op.gt]: new Date() } },
            ],
        },
    });
};

exports.createUserSession = async (sessionData, options = {}) => {
    return await db.UserSession.create(sessionData, options);
};

exports.findActiveSession = async (id, user_id) => {
    if (!id || !user_id) return null;
    return await db.UserSession.findOne({
        where:      { id, user_id, is_online: true, revoked_at: null },
        attributes: ['id', 'user_id', 'is_online', 'revoked_at', 'refresh_token_expires_at'],
    });
};

exports.markOnlineSessionsOffline = async (user_id, options = {}) => {
    return await db.UserSession.update(
        { is_online: false, revoked_at: new Date() },
        { where: { user_id, revoked_at: null }, ...options }
    );
};

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

const STATS_DEFAULTS = {
    title:            '신참',
    total_games:      0,
    survival_count:   0,
    execution_count:  0,
    most_played_role: null,
};

const toPlainStats = (stats) => {
    if (!stats) return { ...STATS_DEFAULTS };

    const plain  = typeof stats.get === "function" ? stats.get({ plain: true }) : stats;
    const merged = { ...STATS_DEFAULTS };

    for (const key of Object.keys(STATS_DEFAULTS)) {
        if (plain[key] !== undefined && plain[key] !== null) merged[key] = plain[key];
    }
    return merged;
};

exports.getMyProfile = async (uuid) => {
    const row = await db.User.findOne({
        where: { uuid },
        attributes: ['nickname', 'profile_image_url'],
        include: [{
            model:      db.UserStats,
            attributes: ['title', 'total_games', 'survival_count', 'execution_count', 'most_played_role'],
        }],
    });

    if (!row) return null;

    return {
        nickname:          row.nickname,
        profile_image_url: row.profile_image_url ?? null,
        UserStat:          toPlainStats(row.UserStat ?? row.UserStats ?? null),
    };
};

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

exports.findExternalIdentity = async ({ provider, subject }, options = {}) => {
    const { transaction, lock } = options;
    return await db.ExternalIdentity.findOne({ where: { provider, subject }, transaction, lock });
};

exports.createExternalIdentity = async (data, options = {}) => {
    try {
        return await db.ExternalIdentity.create(data, options);
    } catch (error) {
        throw toConflictError(error);
    }
};

exports.createOAuthState = async (data, options = {}) => {
    return await db.OAuthState.create(data, options);
};

exports.findOAuthStateByHash = async (stateHash, options = {}) => {
    const { transaction, lock } = options;
    return await db.OAuthState.findOne({ where: { state_hash: stateHash }, transaction, lock });
};

exports.markOAuthStateConsumed = async (id, options = {}) => {
    return await db.OAuthState.update({ consumed_at: new Date() }, { where: { id }, ...options });
};

exports.createSocialSignupIntent = async (data, options = {}) => {
    return await db.SocialSignupIntent.create(data, options);
};

exports.findSocialSignupIntentByHash = async (intentTokenHash, options = {}) => {
    const { transaction, lock } = options;
    return await db.SocialSignupIntent.findOne({ where: { intent_token_hash: intentTokenHash }, transaction, lock });
};

exports.markSocialSignupIntentConsumed = async (id, options = {}) => {
    return await db.SocialSignupIntent.update({ consumed_at: new Date() }, { where: { id }, ...options });
};
