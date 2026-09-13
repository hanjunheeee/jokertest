'use strict';

const crypto = require('node:crypto');

const { createError } = require('../utils/appError');

// 실제 의존성 접근자. achievementService.js의 buildDeps와 **같은 이유**로 각 필드를
// getter로 둔다 — '../models'는 require 시점에 DATABASE_URL을 파싱하므로, overrides.db가
// 있을 때는 `??`의 단락 평가로 require가 아예 실행되지 않아야 한다(객체를 스프레드하면
// 모든 getter가 즉시 평가돼 이 효과가 사라지므로 스프레드하지 않는다).
//
// emitToUser는 socket/socket.js ↔ gameSession.js ↔ 이 모듈의 순환 require를 피하려고
// 호출 시점에만 읽는다. require 자체가 실패하면 null이다 — 통지 통로가 없다는 것이
// 저장 실패는 아니므로 던지지 않는다(A-02).
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../models'); },
    get emitToUser() {
        if (overrides.emitToUser) return overrides.emitToUser;
        try {
            return require('../socket/socket').emitToUser;
        } catch {
            return null;
        }
    },
    get newId() { return overrides.newId ?? (() => crypto.randomUUID()); },
    get now() { return overrides.now ?? (() => new Date()); },
});

let deps = buildDeps();

/** 알림 종류. 프론트 표시 설정(A-03) 매핑의 유일한 출처다. */
const NOTIFICATION_TYPES = Object.freeze({
    FRIEND_REQUEST: 'friend-request',
    // F-19(AC-07): 게임 초대 수신. notifications.type은 STRING(40)이라 enum 확장
    // 마이그레이션이 필요 없다(0012의 실제 컬럼 정의 참고) — 값 하나만 늘리면 된다.
    GAME_INVITE: 'game-invite',
    ACHIEVEMENT: 'achievement',
    SYSTEM: 'system',
});

/**
 * 서버가 고정한 최초 시스템 안내(AC-07).
 *
 * 계정마다 **영구적으로 같은** source_key를 쓴다 — 재접속·재로그인·준비 신호 재시도가
 * 몇 번 오든 (user_id, source_key) 유일 제약이 두 번째 행을 막는다(AC-03).
 * 제목·본문·대상은 전부 서버 코드의 상수다. 클라이언트가 제출한 값은 어디에도 쓰지 않는다.
 */
const SYSTEM_WELCOME = Object.freeze({
    sourceKey: 'system:notifications-available:v1',
    type: NOTIFICATION_TYPES.SYSTEM,
    title: '알림 기능 안내',
    body: '친구 요청과 업적 보상은 알림에서 확인하고, 표시 설정은 환경설정에서 변경할 수 있습니다.',
    target: { kind: 'settings' },
});

/** 친구 요청 원본 행 id로 만드는 안정 source_key. 재시도해도 같은 문자열이다(AC-03). */
const friendRequestSourceKey = (requestId) => `friend-request:${requestId}:received`;

/** 업적 정의 id로 만드는 안정 source_key. 한 계정이 한 업적을 평생 한 번만 지급받는다. */
const achievementSourceKey = (achievementId) => `achievement:${achievementId}:granted`;

/**
 * 게임 초대 행 id로 만드는 안정 source_key(F-19 AC-07).
 *
 * 같은 생성 키로 재시도한 초대는 **같은 초대 행**을 돌려주므로 이 키도 같다 — 두 행·두
 * 신규 사건이 생기지 않는다(A-05). 초대 id는 서버가 만든 UUID다.
 */
const gameInviteSourceKey = (inviteId) => `game-invite:${inviteId}:received`;

/** 소켓·응답으로 나가는 형태. 내부 컬럼을 그대로 흘리지 않고 필요한 것만 고른다. */
const toPublicNotification = (row) => {
    if (row === null || row === undefined) return null;
    const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
        id: plain.id,
        type: plain.type,
        sourceKey: plain.source_key,
        title: plain.title,
        body: plain.body,
        target: plain.target ?? null,
        createdAt: plain.created_at,
        readAt: plain.read_at ?? null,
    };
};

/** 이 오류가 "내 유일 제약 충돌"인지. 다른 DB 오류를 중복으로 삼키지 않는다(AC-03). */
const isDuplicateNotification = (error, db, userId, sourceKey) => {
    // db.Sequelize가 없는 호출부(모델 계약만 흉내 내는 fake db 주입 시험)에서도 판정이
    // 성립해야 하므로 생성자 검사와 name 검사를 함께 본다 — 둘 다 아니면 중복이 아니다.
    const UniqueConstraintError = db?.Sequelize?.UniqueConstraintError;
    const isUniqueError = UniqueConstraintError
        ? error instanceof UniqueConstraintError
        : error?.name === 'SequelizeUniqueConstraintError';
    if (!isUniqueError) return false;
    const constraint = error?.parent?.constraint ?? error?.original?.constraint;
    if (constraint === 'notifications_user_source_unique') return true;
    if (Object.prototype.hasOwnProperty.call(error?.fields ?? {}, 'notifications_user_source_unique')) return true;
    return error?.fields?.user_id === userId && error?.fields?.source_key === sourceKey;
};

/**
 * 알림 한 건을 저장한다.
 *
 * 호출자가 넘긴 transaction 안에서 실행되므로, 이 삽입이 실패하면 호출자의 원본 저장
 * (친구 요청 행·업적 지급과 보상)도 함께 롤백된다(A-02). 반대로 **이미 같은 사건의 행이
 * 있으면** 새로 만들지 않고 created:false로 돌려준다 — 그때는 호출자도 통지하지 않는다.
 *
 * userId·sourceKey·제목·본문·대상은 전부 서버가 정한 값이어야 한다(A-01). 이 함수는
 * 클라이언트 입력을 받는 경로에서 직접 호출되지 않는다.
 *
 * @returns {Promise<{ created: boolean, notification: object }>}
 */
const createNotification = async ({ userId, type, sourceKey, title, body, target = null }, options = {}) => {
    const { newId, now } = deps;
    // economyService.grantAchievementCurrency(payload, db, options)와 같은 관례로 호출부가
    // **자신의 트랜잭션을 연 db 핸들**을 명시적으로 넘길 수 있게 한다 — 두 모듈이 서로 다른
    // Sequelize 인스턴스를 쥐면 같은 트랜잭션에 참여할 수 없어 원자성이 깨진다(A-02).
    const db = options.db ?? deps.db;
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('알림 대상 계정이 없습니다.', 500);
    }
    if (typeof sourceKey !== 'string' || sourceKey.length === 0) {
        throw createError('알림 원본 키가 없습니다.', 500);
    }

    const defaults = {
        id: newId(),
        user_id: userId,
        type,
        source_key: sourceKey,
        title,
        body,
        target,
        created_at: now(),
        read_at: null,
    };

    try {
        const [row, created] = await db.Notification.findOrCreate({
            where: { user_id: userId, source_key: sourceKey },
            defaults,
            transaction: options.transaction,
        });
        return { created, notification: toPublicNotification(row) };
    } catch (error) {
        // 외부 트랜잭션을 넘기면 Sequelize의 내부 유일 제약 자동 재시도가 동작하지 않는다
        // (achievementService.grantAchievement의 CODEX-2 재검토와 같은 상황) — 진짜 동시
        // 호출은 SELECT에서 서로를 보지 못하고 INSERT에서 실제로 충돌한다. 이 충돌만
        // "다른 요청이 이미 만들었다"로 처리하고 나머지 오류는 그대로 던진다.
        if (!isDuplicateNotification(error, db, userId, sourceKey)) throw error;
        const existing = await db.Notification.findOne({
            where: { user_id: userId, source_key: sourceKey },
            transaction: options.transaction,
        });
        return { created: false, notification: toPublicNotification(existing) };
    }
};

/**
 * 커밋된 알림 하나를 그 계정에게만 전달한다(AC-01).
 *
 * **반드시 커밋 이후에** 부른다 — 롤백된 알림이 notification_created로 나가지 않게 하는
 * 것이 A-02의 세 번째 반증 조건이다. 전달 실패는 삼킨다: 수신자가 접속 중이 아니거나
 * 소켓 계층이 아직 없어도 그것은 저장 실패가 아니고, 이미 커밋된 원본 요청·업적 지급을
 * 되돌리거나 호출자의 응답을 실패로 바꾸지 않는다. 놓친 전달은 GET /notifications가
 * 무음으로 복원한다(A-04).
 *
 * sfxEvent는 **시스템 알림에만** 싣는다. 친구·업적은 기존 F-16 수신자
 * (useFriendSocketEvents·useSfxRuntime)가 이미 자기 사건으로 소리를 소유하므로, 여기서
 * 또 봉투를 실으면 한 사건에 소리가 두 번 난다.
 */
const emitNotificationCreated = (userId, notification) => {
    if (notification === null || notification === undefined) return;
    try {
        const emit = deps.emitToUser;
        if (typeof emit !== 'function') return;

        const payload = { notification };
        if (notification.type === NOTIFICATION_TYPES.SYSTEM) {
            payload.sfxEvent = {
                kind: 'system-notification',
                // 저장된 행 id라 재전달·재접속에도 같은 문자열이다(중복 재생 방지의 근거).
                eventId: `notification:${notification.id}`,
                accountId: userId,
                origin: 'live',
            };
        }
        emit(userId, 'notification_created', payload);
    } catch (error) {
        console.error('[알림 전달 실패]', { code: 'NOTIFICATION_EMIT_ERROR', userId, notificationId: notification?.id });
    }
};

/**
 * 친구 요청 수신 알림을 호출자의 트랜잭션 안에서 저장한다(A-02).
 * options.db로 호출부의 db 핸들을 받는다(생략하면 이 모듈의 기본 models).
 */
const createFriendRequestNotification = async ({ receiverId, requestId, requesterNickname }, options = {}) => {
    // 원본 행 id를 확정하지 못했으면 알림을 지어내지 않는다 — 안정 키가 없는 알림은
    // 재시도마다 새 행이 된다.
    if (!Number.isInteger(requestId)) return { created: false, notification: null };

    const who = typeof requesterNickname === 'string' && requesterNickname.trim().length > 0
        ? requesterNickname.trim()
        : '알 수 없는 사용자';

    return createNotification({
        userId: receiverId,
        type: NOTIFICATION_TYPES.FRIEND_REQUEST,
        sourceKey: friendRequestSourceKey(requestId),
        title: '새 친구 요청',
        // 제목·본문은 서버가 만든다. 닉네임만 원본 행에서 읽어 끼운다(길이는 컬럼 상한
        // 안에 들어가도록 자른다 — 저장 실패로 원본 요청까지 롤백되면 안 된다).
        body: `${who.slice(0, 40)} 님이 친구 요청을 보냈습니다.`,
        target: { kind: 'friend-request', requestId },
    }, options);
};

/**
 * 게임 초대 알림을 **초대 생성 트랜잭션 안에서** 저장한다(F-19 AC-07 · A-02).
 *
 * 친구 요청과 같은 구조다: 대상·제목·본문은 전부 서버가 만들고, 닉네임만 원본 계정 행에서
 * 읽어 끼운다. 클라이언트가 보낸 값은 어디에도 들어가지 않는다.
 *
 * target은 {kind:'game-invite', inviteId}다 — 이 값으로 초대를 새로 만들거나 자동 수락하지
 * 않는다. 로비가 실제 초대 목록에서 같은 id를 찾아 강조할 뿐이다.
 */
const createGameInviteNotification = async ({ receiverId, inviteId, senderNickname }, options = {}) => {
    // 초대 행 id를 확정하지 못했으면 알림을 지어내지 않는다 — 안정 키가 없는 알림은
    // 재시도마다 새 행이 된다(친구 요청과 같은 이유).
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        return { created: false, notification: null };
    }

    const who = typeof senderNickname === 'string' && senderNickname.trim().length > 0
        ? senderNickname.trim()
        : '알 수 없는 사용자';

    return createNotification({
        userId: receiverId,
        type: NOTIFICATION_TYPES.GAME_INVITE,
        sourceKey: gameInviteSourceKey(inviteId),
        title: '게임 초대',
        body: `${who.slice(0, 40)} 님이 대기방으로 초대했습니다.`,
        target: { kind: 'game-invite', inviteId },
    }, options);
};

/**
 * 업적 지급 알림을 grantAchievement의 지급 트랜잭션 안에서 저장한다(A-02).
 * options.db로 호출부의 db 핸들을 받는다(생략하면 이 모듈의 기본 models).
 */
const createAchievementNotification = async ({ userId, achievementId }, options = {}) => {
    if (typeof achievementId !== 'string' || achievementId.length === 0) {
        return { created: false, notification: null };
    }

    return createNotification({
        userId,
        type: NOTIFICATION_TYPES.ACHIEVEMENT,
        sourceKey: achievementSourceKey(achievementId),
        title: '업적 달성',
        body: '새 업적을 달성해 보상을 받았습니다. 기억의 서고에서 확인하세요.',
        target: { kind: 'achievement', achievementId },
    }, options);
};

/**
 * 최초 시스템 안내를 보장한다(AC-07의 신규 생산자).
 *
 * 실제 발생 조건은 "유효한 인증 계정의 알림 수신기가 초기 목록 복원을 마쳐 준비됐고, 그
 * 계정에 이 사건이 아직 없는 경우"다 — 호출부(socket.js의 notifications_ready)가 계정과
 * 현재 소켓을 확인한 뒤에만 부른다. 여기서는 클라이언트가 보낸 어떤 값도 쓰지 않는다.
 *
 * 새로 만든 경우에만 emit한다. 이미 있으면 조용히 끝난다 — 재시도가 같은 사건을 다시
 * 발행하지 않는다(A-04).
 *
 * @returns {Promise<{ created: boolean, notification: object|null }>}
 */
const ensureSystemWelcome = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) {
        return { created: false, notification: null };
    }

    const { db } = deps;
    const result = await db.sequelize.transaction(async (transaction) => createNotification({
        userId,
        type: SYSTEM_WELCOME.type,
        sourceKey: SYSTEM_WELCOME.sourceKey,
        title: SYSTEM_WELCOME.title,
        body: SYSTEM_WELCOME.body,
        target: SYSTEM_WELCOME.target,
    }, { transaction }));

    // 트랜잭션이 실제로 커밋된 뒤에만 여기 도달한다(롤백은 예외로 빠져나간다).
    if (result.created) emitNotificationCreated(userId, result.notification);
    return result;
};

/**
 * 계정의 알림 전체를 최신순으로 돌려준다(AC-06 / A-04).
 *
 * 읽기 전용이다 — 생성·읽음 변경·SFX 발행을 하지 않는다. 임의 LIMIT를 두지 않는 이유는
 * 수신 측이 이 응답의 id 집합을 "이미 본 사건"으로 쓰기 때문이다(A-04): 잘린 목록은
 * 복원 seen 집합을 불완전하게 만들어, 잘려나간 오래된 사건이 나중에 live로 도착했을 때
 * 소리가 나게 된다.
 */
const listForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) return [];
    const { db } = deps;
    const rows = await db.Notification.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC'], ['id', 'DESC']],
    });
    return rows.map(toPublicNotification);
};

/** 경로 인자가 우리가 발급한 형태(UUID)인지. 아니면 400이다. */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * 알림 하나를 읽음으로 확정한다(AC-02).
 *
 * id와 소유 계정을 **함께** 조건으로 쓴다 — 다른 계정의 id를 넣어도 조회 자체가 비어
 * 404가 되고, 어떤 행도 바뀌지 않는다(A-05). 이미 읽은 알림은 최초 read_at을 유지한다
 * (멱등) — 응답 유실 후 재시도가 읽음 시각을 뒤로 밀지 않는다.
 */
const markRead = async (userId, notificationId) => {
    if (typeof notificationId !== 'string' || !UUID_PATTERN.test(notificationId)) {
        throw createError('유효하지 않은 알림 id입니다.', 400);
    }

    const { db, now } = deps;
    return db.sequelize.transaction(async (transaction) => {
        const row = await db.Notification.findOne({
            where: { id: notificationId, user_id: userId },
            transaction,
        });
        // 다른 계정의 알림과 없는 알림을 구분하지 않는다 — 존재 여부 자체가 새어나가지
        // 않도록 둘 다 404다.
        if (!row) throw createError('알림을 찾을 수 없습니다.', 404);

        if (row.read_at === null || row.read_at === undefined) {
            await db.Notification.update(
                { read_at: now() },
                // read_at: null 조건을 함께 둬 동시 PATCH가 최초 시각을 덮지 않게 한다.
                { where: { id: notificationId, user_id: userId, read_at: null }, transaction },
            );
        }

        // 확정된 행을 다시 읽어 돌려준다 — 클라이언트가 자기 시각을 만들지 않고 서버가
        // 확정한 read_at만 반영하게 한다.
        const confirmed = await db.Notification.findOne({
            where: { id: notificationId, user_id: userId },
            transaction,
        });
        return toPublicNotification(confirmed);
    });
};

module.exports = {
    NOTIFICATION_TYPES,
    SYSTEM_WELCOME,
    friendRequestSourceKey,
    gameInviteSourceKey,
    achievementSourceKey,
    toPublicNotification,
    createNotification,
    createFriendRequestNotification,
    createGameInviteNotification,
    createAchievementNotification,
    emitNotificationCreated,
    ensureSystemWelcome,
    listForUser,
    markRead,
    // 테스트 전용 — achievementService.__internal.__setDepsForTests와 같은 관례다.
    // 런타임 코드에서는 참조하지 않는다.
    __internal: {
        __setDepsForTests(overrides) {
            deps = buildDeps(overrides ?? {});
        },
    },
};
