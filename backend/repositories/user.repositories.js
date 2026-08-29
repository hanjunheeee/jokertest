const db              = require("../models");
const { Op }          = db.Sequelize;
const { createError } = require("../utils/appError");

// unique 제약 위반은 "값이 이미 쓰이고 있다"는 도메인 사실이지 서버 결함이 아닙니다.
// 그대로 흘리면 globalErrorHandler가 status 없는 Sequelize 에러를 500으로 내보내므로,
// 저장 경로 한 곳에서 409로 바꿔 둡니다. 사전 조회(findByNickname 등)를 통과한 뒤
// 동시 요청이 먼저 값을 차지한 경합에서도 같은 응답이 나갑니다.
const UNIQUE_CONFLICTS = [
    { field: "nickname", message: "이미 사용 중인 닉네임입니다." },
    { field: "email",    message: "이미 사용 중인 이메일입니다." },
];

const toConflictError = (error) => {
    if (error?.name !== "SequelizeUniqueConstraintError") return error;

    // 어느 컬럼이 걸렸는지는 dialect마다 다른 자리에 담깁니다. MySQL은 인덱스 이름
    // (users_nickname_unique 같은)만 주기도 해서 정확히 일치가 아니라 포함으로 봅니다.
    // errors는 Sequelize v6에서 미지정 시 배열이 아니라 {}가 되고, fields도 dialect에 따라
    // 배열/객체가 갈립니다. 힌트를 못 찾는 건 괜찮지만 여기서 터지면 409가 500으로 돌아갑니다.
    const errorItems = Array.isArray(error.errors) ? error.errors : [];
    const fields     = error.fields ?? {};
    const hints      = [
        ...errorItems.map((item) => item?.path),
        ...(Array.isArray(fields) ? fields : Object.keys(fields)),
    ].filter(Boolean).map(String);

    const hit = UNIQUE_CONFLICTS.find(({ field }) => hints.some((hint) => hint.includes(field)));
    return createError(hit?.message ?? "이미 사용 중인 값입니다.", 409);
};

// 서비스 계층이 db 인스턴스를 직접 import하지 않고도 트랜잭션 경계를 열 수 있게 합니다.
// work가 throw하면 Sequelize의 managed transaction이 롤백한 뒤 원래 에러를 다시 던집니다.
exports.withTransaction = async (work) => {
    return await db.sequelize.transaction(work);
};

exports.findByEmail = async (email) => {
    return await db.User.findOne({ where: { email } });
};

exports.findByNickname = async (nickname) => {
    return await db.User.findOne({ where: { nickname } });
};

exports.findByUuid = async (uuid) => {
    return await db.User.findOne({ where: { uuid } });
};

// options는 { transaction } 전달용입니다. 기본값이 있어 기존 호출부는 그대로 동작합니다.
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

exports.createLoginHistory = async (historyData) => {
    return await db.LoginHistory.create(historyData);
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

exports.createUserSession = async (sessionData) => {
    return await db.UserSession.create(sessionData);
};

// 토큰의 sessionId(= user_sessions.id, PK)로 세션 한 건을 읽습니다. 인증 미들웨어가
// "서명은 유효하지만 이미 내려간 세션"을 판별할 유일한 수단입니다.
exports.findSessionById = async (id) => {
    if (!id) return null;
    return await db.UserSession.findOne({
        where:      { id },
        attributes: ['id', 'user_id', 'is_online'],
    });
};

exports.markOnlineSessionsOffline = async (user_id) => {
    return await db.UserSession.update(
        { is_online: false },
        { where: { user_id, is_online: true } }
    );
};

// user_stats 행이 없는 계정(트랜잭션 도입 이전에 반쪽으로 생성됐거나, 통계를 아직
// 한 번도 쓰지 않은 계정)이 실제로 존재합니다. include에 where/required가 없어 쿼리는
// LEFT JOIN이라 null을 돌려줄 뿐이므로, 결측 보정은 이 자리에서 끝냅니다.
const STATS_DEFAULTS = {
    reputation:       0,
    title:            '신참',
    total_games:      0,
    survival_count:   0,
    execution_count:  0,
    most_played_role: null,
};

const toPlainStats = (stats) => {
    if (!stats) return { ...STATS_DEFAULTS };

    // Sequelize 인스턴스는 스프레드하면 dataValues 같은 내부 속성이 나오므로 평탄화합니다.
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
            attributes: ['reputation', 'title', 'total_games', 'survival_count', 'execution_count', 'most_played_role'],
        }],
    });

    if (!row) return null;

    // hasOne(UserStats)의 기본 접근자는 단수형 'UserStat'입니다. 별칭이 바뀌어도
    // 프로필이 조용히 0으로 깨지지 않도록 두 이름을 모두 확인합니다.
    return {
        nickname:          row.nickname,
        profile_image_url: row.profile_image_url ?? null,
        UserStat:          toPlainStats(row.UserStat ?? row.UserStats ?? null),
    };
};

exports.recordLogout = async (user_id) => {
    const lastLogin = await db.LoginHistory.findOne({
        where: { user_id, success: true, logout_at: null },
        order: [['login_at', 'DESC']],
    });
    if (lastLogin) {
        await lastLogin.update({ logout_at: new Date() });
    }
    await db.UserSession.update(
        { is_online: false },
        { where: { user_id, is_online: true } }
    );
};
