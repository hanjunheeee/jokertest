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
    // F-05 AC-01: external_identities의 (provider, subject) 복합 유일 인덱스 이름에
    // 포함된 부분 문자열이다 — 동시에 같은 소셜 계정을 연결하려는 경합을 409로 정규화한다.
    { field: "provider_subject", message: "이미 연결된 소셜 계정입니다." },
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

// options로 { transaction, lock }을 받는다 — 로그인과 비밀번호 변경이 같은 유저 행을
// FOR UPDATE로 잠그고 직렬화하기 위해 쓴다(F-03 A-04/R-IMPL #7): 비밀번호 변경 트랜잭션이
// 이 행을 잠근 동안에는 동시 로그인도 대기했다가, 트랜잭션이 커밋된 뒤에야 최신
// password_hash로 비교하게 되어 "옛 비밀번호로 통과한 로그인이 변경 이후에 세션을 만드는"
// 경합을 막는다.
exports.findByEmail = async (email, options = {}) => {
    const { transaction, lock } = options;
    return await db.User.findOne({ where: { email }, transaction, lock });
};

exports.findByNickname = async (nickname) => {
    return await db.User.findOne({ where: { nickname } });
};

exports.findByUuid = async (uuid, options = {}) => {
    const { transaction, lock } = options;
    return await db.User.findOne({ where: { uuid }, transaction, lock });
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

// 토큰의 sessionId(= user_sessions.id, PK)로 세션 한 건을 읽습니다. 인증 미들웨어가
// "서명은 유효하지만 이미 내려간 세션"을 판별할 유일한 수단입니다. revoked_at은
// is_online과 별개로 명시적 폐기(로그아웃·비밀번호 변경·재사용 감지)를 나타내므로
// 둘 다 확인해야 HTTP·Socket.IO가 같은 기준으로 거부한다(F-03 AC-05/AC-09).
// refresh_token_expires_at도 함께 읽어, sessionLifecycle.resolveSession이 로그인 시점의
// 절대 30일 기한을 넘긴 세션을 (JWT 자체의 exp와 무관하게) 거부할 수 있게 한다 — 이미
// 연결된 소켓은 handshake 이후 JWT를 다시 검증하지 않으므로, 그 경로에서 기한 초과를
// 잡아낼 유일한 수단은 이 DB 필드다(F-03 R-IMPL #4).
exports.findActiveSession = async (id, user_id) => {
    if (!id || !user_id) return null;
    return await db.UserSession.findOne({
        where:      { id, user_id, is_online: true, revoked_at: null },
        attributes: ['id', 'user_id', 'is_online', 'revoked_at', 'refresh_token_expires_at'],
    });
};

// 이 사용자의 아직 폐기되지 않은 세션을 모두 폐기합니다(is_online=false + revoked_at 기록).
// 로그인 시 중복 세션 정리, 비밀번호 변경, 갱신 자격 재사용 감지가 모두 이 함수를 씁니다 —
// 세 경우 전부 "이전에 발급된 자격은 더 이상 유효하지 않아야 한다"는 같은 요구이기 때문입니다.
// is_online 여부로 대상을 좁히지 않는 이유: is_online이 이미 false인 세션도 갱신 자격
// (refresh_token_hash)은 여전히 유효할 수 있어, 그 경로까지 함께 막아야 합니다.
exports.markOnlineSessionsOffline = async (user_id, options = {}) => {
    return await db.UserSession.update(
        { is_online: false, revoked_at: new Date() },
        { where: { user_id, revoked_at: null }, ...options }
    );
};

// 갱신 요청이 제시한 해시로 세션을 찾습니다. refresh_token_hash(현재 유효한 자격)와
// refresh_previous_hash(방금 회전되어 대체된 자격, 응답유실 유예용) 둘 다 대조합니다.
// transaction이 있으면 FOR UPDATE로 잠가 동시 회전 요청이 서로의 갱신을 덮어쓰지 못하게
// 합니다(F-03 A-03/A-08).
//
// 현재·직전 해시 둘 다와 맞지 않으면, 이 세션이 과거에(2세대 이상 전) 실제로 회전시켜
// 소비한 자격일 수 있습니다 — 그 이력은 refresh_token_history에 남아 있습니다(F-03
// R-IMPL #11, applyRefreshRotation 참고). 여기서 그 이력까지 찾아내야, 호출부
// (auth.service.js의 refresh)가 "모르는 자격"으로 조용히 놓치지 않고 재사용 감지로
// 세션 전체를 폐기할 수 있습니다. 이력에 없는 임의의 미발급 해시는 어떤 세션도 찾아내지
// 못하므로 정상 세션을 폐기하지 않습니다.
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

// 갱신 자격을 회전시킵니다. 기존 refresh_token_hash는 previousHash로 물러나 짧은 유예
// 동안만 재시도를 허용하고, 절대 만료(refresh_token_expires_at)는 건드리지 않습니다 —
// 회전이 로그인 시점 기준 30일 창을 연장해서는 안 됩니다(F-03 A-01/A-03).
//
// evictedHash는 이번 회전으로 refresh_previous_hash 칸에서 밀려나 사라질 이전 세대의
// 해시입니다(최초 회전 시에는 previous가 아직 없어 null입니다). 그대로 버리면 2세대 이상
// 전 자격의 재사용을 더 이상 추적할 수 없으므로, 회전과 같은 트랜잭션 안에서
// refresh_token_history에 남깁니다(F-03 R-IMPL #11) — 회전 커밋과 이력 기록이 분리되면
// 한쪽만 반영된 채 끝나는 부분 커밋이 생길 수 있습니다.
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

// ── F-05: 소셜 계정 공통 기반 ────────────────────────────────────────────────

// (provider, subject) 조합으로 이미 연결된 identity가 있는지 조회한다. 있으면 재로그인
// (AC-03)이고, 없으면 최초 로그인(가입 보완 필요)이다.
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

// state_hash는 절대 원문을 저장하지 않는 해시다(F-05 AC-05). lock을 넘기면 소비(consume)
// 시점에 동시 재사용 요청을 직렬화한다.
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
