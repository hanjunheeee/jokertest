'use strict';

// F-19 게임 초대 서비스 — 실제 초대 생성·조회·수락 결정·거절·만료의 SQL 경계다.
//
// 이 모듈이 소유하는 것과 소유하지 않는 것을 분명히 나눈다(A-10):
//
//   소유한다  : GameInvite 행의 status/revision/decided_at(역사적 수락 결정),
//               entry_outcome(역사적 publication 영수증), 수신자 snapshot과 커서.
//   소유 안 함: gameRooms/playerRoom(현재 canonical membership), socket.join,
//               예약(admission reservation). 전부 matchmaking.js의 것이다.
//
// 그래서 "입장 성공"은 이 모듈 혼자 판정할 수 없다 — 확정 영수증(PUBLISHED)과 현재 소속이
// **함께** 확인될 때만 성공이다. 그 조합 판정은 matchmaking.js가 한다.
//
// 방 정보는 새 registry를 만들지 않고 matchmaking.js가 주입한 접근자로만 읽는다
// (__setRoomAccessForRuntime). 이 방향(matchmaking → service)만 존재하므로 require 순환이
// 생기지 않는다.

const crypto = require('node:crypto');

const friendRepository = require('../repositories/friend.repositories');
const notificationService = require('./notification.service');
const { createError } = require('../utils/appError');

// '../models'는 require 시점에 DATABASE_URL을 파싱한다 — notification.service.js의 buildDeps와
// 같은 이유로 getter로 감싸 실제 접근 시점까지 미룬다(overrides.db가 있으면 아예 require하지
// 않는다).
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

/** 초대 유효 시간. 서버 시각으로만 판단한다(클라이언트 시계를 신뢰하지 않는다). */
const INVITE_TTL_MS = 3 * 60 * 1000;

const INVITE_STATUS = Object.freeze({
    PENDING: 'PENDING',
    ACCEPTED: 'ACCEPTED',
    DECLINED: 'DECLINED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
});

/** entry_outcome — 역사적 publication 영수증. status와 **다른 사실**이다. */
const ENTRY_OUTCOME = Object.freeze({
    UNCONFIRMED: 'UNCONFIRMED',
    PUBLISHED: 'PUBLISHED',
    INTERRUPTED: 'INTERRUPTED',
});

// ── matchmaking이 주입하는 방 접근자 ─────────────────────────────────────────
//
// 기본값은 "아무 방도 없다"이다. 주입이 없으면 초대는 만들어지지 않는다 — 방 권한을
// 알 수 없는 상태에서 초대를 발급하지 않기 위해서다.
const NO_ROOM_ACCESS = Object.freeze({
    bootEpoch: 'unbound',
    describeRoomForInvite: () => null,
    getRoomIdForUser: () => null,
    describeReceiverAvailability: () => ({ available: false, code: 'ROOM_ACCESS_UNAVAILABLE' }),
});

let roomAccess = NO_ROOM_ACCESS;

/** matchmaking.js 전용: canonical registry 접근자를 주입한다(새 registry를 만들지 않는다). */
function __setRoomAccessForRuntime(access) {
    roomAccess = access ?? NO_ROOM_ACCESS;
}

// ── 공개 형태 ────────────────────────────────────────────────────────────────

/**
 * 소켓·응답으로 나가는 초대 형태.
 *
 * **수락 전 방 코드/방 id를 넣지 않는다**(AC-06) — 초대를 받은 사실만으로 코드 참가 경로에
 * 우회 입장할 수 있으면 초대 권한 검사가 무의미해진다. 수신자가 알아야 하는 것은 inviteId와
 * 누가 불렀는지, 언제까지인지뿐이다.
 *
 * creation_seq는 BIGINT라 JS number로 옮기면 정밀도를 잃을 수 있어 **문자열**로 내보낸다.
 */
const toPublicInvite = (row, senderNickname = null) => {
    if (row === null || row === undefined) return null;
    const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
        inviteId: plain.id,
        senderId: plain.sender_id,
        senderName: senderNickname ?? plain.InviteSender?.nickname ?? null,
        receiverId: plain.receiver_id,
        status: plain.status,
        revision: plain.revision,
        creationSeq: String(plain.creation_seq),
        createdAt: plain.created_at,
        expiresAt: plain.expires_at,
        decidedAt: plain.decided_at ?? null,
        endReason: plain.end_reason ?? null,
        entryOutcome: plain.entry_outcome ?? null,
    };
};

/** 두 문자열 순번을 비교한다(BIGINT 정밀도를 잃지 않도록 자릿수 우선 비교). */
const compareSeq = (left, right) => {
    const a = String(left ?? '0').replace(/^0+(?=\d)/, '');
    const b = String(right ?? '0').replace(/^0+(?=\d)/, '');
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
};

// ── 내부 도우미 ──────────────────────────────────────────────────────────────

/**
 * 수신자 User 행을 잠근다(A-09).
 *
 * 초대 **생성**과 **snapshot 조회**가 같은 잠금을 공유해야 "커서 이하 id가 뒤늦게 커밋되는"
 * 창이 사라진다. 상태 변경(수락·거절·만료·차단 무효화)도 같은 잠금에 참여한다.
 */
const lockReceiver = async (db, receiverId, transaction) => {
    return await db.User.findOne({
        where: { uuid: receiverId },
        attributes: ['uuid', 'nickname', 'status'],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
};

/** 이 계정쌍이 지금 서로 초대를 주고받을 수 있는가. 어느 방향의 차단이든 막는다(AC-04). */
const isBlockedBetween = async (uuidA, uuidB, options = {}) => {
    const blocks = await friendRepository.findBlocksBetween(uuidA, uuidB, options);
    return blocks.length > 0;
};

/**
 * 만료 시각이 지난 이 수신자의 PENDING 초대를 EXPIRED로 확정한다(멱등).
 *
 * 조회·수락·거절 경계에서 모두 같은 함수를 부른다 — 그래야 "화면에는 살아 있는데 서버는
 * 만료"라는 어긋남이 생기지 않는다. revision을 함께 올려 지연 도착한 생성 사건이 이
 * terminal 상태를 되살리지 못하게 한다(A-06).
 */
const expireDueInvitesForReceiver = async (db, receiverId, now, transaction) => {
    const [affected] = await db.GameInvite.update(
        {
            status: INVITE_STATUS.EXPIRED,
            end_reason: 'EXPIRED',
            decided_at: now,
            revision: db.sequelize.literal('revision + 1'),
        },
        {
            where: {
                receiver_id: receiverId,
                status: INVITE_STATUS.PENDING,
                expires_at: { [db.Sequelize.Op.lte]: now },
            },
            transaction,
        },
    );
    return affected ?? 0;
};

// ── AC-06: 초대 생성 ─────────────────────────────────────────────────────────

/**
 * 실제 초대를 만든다.
 *
 * 권한 근거는 전부 서버가 확인한다(A-05):
 *   - 발송자의 **현재** 방 소속과 방 인스턴스(주입된 registry에서 읽는다)
 *   - 친구 관계와 양방향 차단 없음
 *   - 수신자 계정 활성 상태
 *   - 수신자가 지금 초대를 받을 수 있는 상태(활성 게임·다른 방·전환 중이 아님)
 *
 * creationKey는 **발송 계정에 귀속된** 멱등 키다. 같은 키로 다시 오면 기존 행을 그대로
 * 돌려주고 신규 수신 사건(game_invite_received·notification_created)을 재발행하지 않는다.
 * 같은 키에 다른 대상·다른 방을 실어 보내면 성공이 아니라 409 충돌이다.
 *
 * 생성 시점에는 방 자리를 예약하지 않는다 — 예약은 수락 처리 중에만 짧게 생긴다.
 */
async function createInvite({ senderId, receiverId, creationKey }) {
    const { db, now } = deps;

    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        throw createError('초대할 상대를 지정해야 합니다.', 400);
    }
    if (receiverId === senderId) {
        throw createError('자기 자신을 초대할 수 없습니다.', 400);
    }
    if (typeof creationKey !== 'string' || creationKey.trim().length === 0 || creationKey.length > 120) {
        throw createError('초대 생성 키가 필요합니다.', 400);
    }
    const normalizedKey = creationKey.trim();

    // 발송자의 현재 방은 **서버 registry**에서만 읽는다. 클라이언트가 보낸 방 코드·roomId는
    // 쓰지 않는다(A-05).
    const roomId = roomAccess.getRoomIdForUser(senderId);
    const room = roomId ? roomAccess.describeRoomForInvite(roomId) : null;
    if (!room) {
        throw createError('초대를 보낼 대기방이 없습니다.', 409);
    }
    if (room.isFull) {
        throw createError('방이 가득 차 초대를 보낼 수 없습니다.', 409);
    }

    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + INVITE_TTL_MS);
    const bootEpoch = roomAccess.bootEpoch;

    const result = await db.sequelize.transaction(async (t) => {
        // 초대 생성과 snapshot 조회가 같은 수신자 잠금을 공유한다(A-09).
        const receiver = await lockReceiver(db, receiverId, t);
        if (!receiver) throw createError('초대할 사용자를 찾을 수 없습니다.', 404);
        if (receiver.status !== 'ACTIVE') throw createError('초대할 수 없는 계정입니다.', 403);

        // 같은 생성 키의 재시도인지 먼저 본다 — 아래 검사들이 그 사이 상태 변화로 실패해도
        // 이미 성공했던 요청의 재시도는 같은 결과를 돌려줘야 한다.
        const existing = await db.GameInvite.findOne({
            where: { sender_id: senderId, creation_key: normalizedKey },
            transaction: t,
        });
        if (existing) {
            // 같은 키에 다른 대상·다른 방을 실어 보낸 요청은 "성공한 재시도"가 아니다.
            if (existing.receiver_id !== receiverId || existing.room_id !== room.roomId) {
                throw createError('같은 생성 키로 다른 초대를 보낼 수 없습니다.', 409);
            }
            return { invite: existing, created: false, notification: null, senderNickname: null };
        }

        if (await isBlockedBetween(senderId, receiverId, { transaction: t })) {
            throw createError('차단된 사용자에게는 게임 초대를 보낼 수 없습니다.', 403);
        }

        const friendship = await friendRepository.findExistingFriendship(senderId, receiverId);
        if (!friendship || friendship.status !== 'ACCEPTED') {
            throw createError('친구만 게임에 초대할 수 있습니다.', 403);
        }

        const availability = roomAccess.describeReceiverAvailability(receiverId);
        if (!availability.available) {
            throw createError('지금은 상대를 초대할 수 없습니다.', 409, availability.code);
        }

        const sender = await db.User.findOne({
            where: { uuid: senderId }, attributes: ['nickname'], transaction: t,
        });

        const invite = await db.GameInvite.create({
            id: deps.newId(),
            sender_id: senderId,
            receiver_id: receiverId,
            room_id: room.roomId,
            room_instance_id: room.roomInstanceId,
            boot_epoch: bootEpoch,
            creation_key: normalizedKey,
            revision: 1,
            status: INVITE_STATUS.PENDING,
            created_at: createdAt,
            expires_at: expiresAt,
        }, { transaction: t });

        // F-17 관례: 원본 행과 알림 행을 같은 트랜잭션에서 확정한다. 알림 삽입이 실패하면
        // 초대도 함께 롤백된다 — "초대는 갔는데 알림만 없는" 상태가 남지 않는다.
        const notificationResult = await notificationService.createGameInviteNotification({
            receiverId,
            inviteId: invite.id,
            senderNickname: sender?.nickname ?? null,
        }, { db, transaction: t });

        return {
            invite,
            created: true,
            notification: notificationResult.created ? notificationResult.notification : null,
            senderNickname: sender?.nickname ?? null,
        };
    });

    const publicInvite = toPublicInvite(result.invite, result.senderNickname);

    // 커밋 이후에만 전달한다. 같은 생성 키의 재시도(created=false)는 아무 사건도 다시
    // 발행하지 않는다 — 그래야 재시도가 소리를 한 번 더 내지 않는다(A-05/A-06).
    if (result.created) {
        emitInviteReceived(receiverId, publicInvite);
        if (result.notification !== null) {
            notificationService.emitNotificationCreated(receiverId, result.notification);
        }
    }

    return { invite: publicInvite, created: result.created };
}

/**
 * 신규 수신 사건 하나를 수신자에게만 전달한다.
 *
 * sfxEvent의 eventId는 **초대 id 기반의 안정 문자열**이다 — 같은 초대를 다시 전달해도 같은
 * 문자열이라 수신 측이 중복 재생을 판정할 수 있다. 실제 소리 적격성(커서 이후인가, 최신
 * 상태가 PENDING인가)은 수신 클라이언트의 한 경계가 판정한다(A-06).
 */
function emitInviteReceived(receiverId, publicInvite) {
    try {
        const emit = deps.emitToUser;
        if (typeof emit !== 'function') return;
        emit(receiverId, 'game_invite_received', {
            invite: publicInvite,
            sfxEvent: {
                kind: 'game-invite',
                eventId: notificationService.gameInviteSourceKey(publicInvite.inviteId),
                accountId: receiverId,
                origin: 'live',
            },
        });
    } catch (error) {
        console.error('[게임 초대 전달 실패]', { code: 'GAME_INVITE_EMIT_ERROR', receiverId });
    }
}

/** 상태 변경을 수신자·발송자에게 알린다(소리 없음 — 신규 수신이 아니다). */
function emitInviteUpdated(userIds, publicInvite) {
    const emit = deps.emitToUser;
    if (typeof emit !== 'function') return;
    for (const userId of new Set(userIds.filter(Boolean))) {
        try {
            emit(userId, 'game_invite_updated', { invite: publicInvite });
        } catch (error) {
            console.error('[게임 초대 상태 전달 실패]', { code: 'GAME_INVITE_UPDATE_EMIT_ERROR', userId });
        }
    }
}

// ── AC-07: snapshot + 커서 ───────────────────────────────────────────────────

/**
 * 수신자의 초대 snapshot과 소리 커서를 **같은 읽기 경계**에서 계산한다(A-09).
 *
 * 커서는 종료된 행까지 포함한 수신자 전체 최대 creation_seq다. PENDING만의 최댓값을 쓰면
 * 이미 끝난 과거 초대가 "커서 이후"로 보여 새 사건으로 오인된다.
 *
 * 수신자 User 행 잠금을 먼저 잡으므로, 이 시점 이후에 커밋되는 초대는 반드시 커서보다 큰
 * 순번을 갖는다 — 즉 "커서 이하인데 나중에 도착하는" 사건이 존재하지 않는다.
 */
async function getReceiverSnapshot(receiverId) {
    const { db, now } = deps;
    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        return { invites: [], cursor: '0' };
    }

    return await db.sequelize.transaction(async (t) => {
        await lockReceiver(db, receiverId, t);
        await expireDueInvitesForReceiver(db, receiverId, now(), t);

        const rows = await db.GameInvite.findAll({
            where: { receiver_id: receiverId, status: INVITE_STATUS.PENDING },
            include: [{ model: db.User, as: 'InviteSender', attributes: ['uuid', 'nickname'] }],
            order: [['creation_seq', 'ASC']],
            transaction: t,
        });

        const newest = await db.GameInvite.findOne({
            where: { receiver_id: receiverId },
            attributes: ['creation_seq'],
            order: [['creation_seq', 'DESC']],
            transaction: t,
        });

        return {
            invites: rows.map((row) => toPublicInvite(row)),
            cursor: newest ? String(newest.creation_seq) : '0',
        };
    });
}

/** 초대 하나를 당사자에게만 돌려준다. 제3자는 존재 여부도 알 수 없다(404). */
async function getInviteForUser(viewerId, inviteId) {
    const { db, now } = deps;
    if (typeof inviteId !== 'string' || inviteId.length === 0) {
        throw createError('유효하지 않은 초대 id입니다.', 400);
    }

    return await db.sequelize.transaction(async (t) => {
        const row = await db.GameInvite.findOne({
            where: { id: inviteId },
            include: [{ model: db.User, as: 'InviteSender', attributes: ['uuid', 'nickname'] }],
            transaction: t,
        });
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row.receiver_id !== viewerId && row.sender_id !== viewerId) {
            throw createError('초대를 찾을 수 없습니다.', 404);
        }

        // 조회 경계에서도 만료를 멱등하게 확정한다 — 화면과 서버의 상태가 갈리지 않게.
        if (row.status === INVITE_STATUS.PENDING && row.expires_at.getTime() <= now().getTime()) {
            await lockReceiver(db, row.receiver_id, t);
            await expireDueInvitesForReceiver(db, row.receiver_id, now(), t);
            await row.reload({ transaction: t });
        }

        return toPublicInvite(row);
    });
}

// ── AC-06: 거절 ──────────────────────────────────────────────────────────────

async function declineInvite(receiverId, inviteId) {
    const { db, now } = deps;
    const decided = await db.sequelize.transaction(async (t) => {
        await lockReceiver(db, receiverId, t);
        await expireDueInvitesForReceiver(db, receiverId, now(), t);

        const row = await db.GameInvite.findOne({
            where: { id: inviteId }, transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row.receiver_id !== receiverId) throw createError('초대를 찾을 수 없습니다.', 404);
        // 이미 끝난 초대의 거절은 **멱등**이다 — 응답이 유실돼 다시 눌러도 오류가 아니라
        // 현재 상태를 그대로 돌려준다. 단 이미 수락된 초대를 거절로 뒤집지는 않는다.
        if (row.status !== INVITE_STATUS.PENDING) {
            return { row, changed: false };
        }

        await row.update({
            status: INVITE_STATUS.DECLINED,
            end_reason: 'DECLINED',
            decided_at: now(),
            revision: row.revision + 1,
        }, { transaction: t });

        return { row, changed: true };
    });

    const publicInvite = toPublicInvite(decided.row);
    if (decided.changed) emitInviteUpdated([decided.row.sender_id, receiverId], publicInvite);
    return publicInvite;
}

// ── AC-05: 차단·방 상실에 따른 무효화 ────────────────────────────────────────

/**
 * 이 계정쌍의 PENDING 초대를 전부 CANCELLED로 확정한다(AC-05).
 *
 * **호출자의 트랜잭션 안에서** 실행된다(friend.service.blockUser). 행을 지우지 않고 사유와
 * revision만 남기므로, 차단을 해제해도 PENDING으로 되돌아가지 않는다.
 */
async function cancelPendingInvitesBetween(uuidA, uuidB, reason, options = {}) {
    const db = options.db ?? deps.db;
    const { Op } = db.Sequelize;
    const now = deps.now();

    const rows = await db.GameInvite.findAll({
        where: {
            status: INVITE_STATUS.PENDING,
            [Op.or]: [
                { sender_id: uuidA, receiver_id: uuidB },
                { sender_id: uuidB, receiver_id: uuidA },
            ],
        },
        transaction: options.transaction,
    });
    if (rows.length === 0) return [];

    await db.GameInvite.update(
        {
            status: INVITE_STATUS.CANCELLED,
            end_reason: reason,
            decided_at: now,
            revision: db.sequelize.literal('revision + 1'),
        },
        { where: { id: { [Op.in]: rows.map((row) => row.id) } }, transaction: options.transaction },
    );

    return rows.map((row) => row.id);
}

/**
 * 방이 사라졌거나(삭제·시작) 발송자가 소속을 잃었을 때 그 방의 PENDING 초대를 종료한다.
 *
 * 이 보상은 **지연 실행**이고 실패해도 된다 — 입장 검사는 언제나 현재 방 상태로 다시
 * 하므로(matchmaking.js), 보상이 실패해도 이미 사라진 방으로 입장할 수는 없다.
 */
async function cancelPendingInvitesForRoom(roomId, reason) {
    const { db, now } = deps;
    if (typeof roomId !== 'string' || roomId.length === 0) return [];

    const rows = await db.GameInvite.findAll({
        where: { room_id: roomId, status: INVITE_STATUS.PENDING },
        attributes: ['id', 'sender_id', 'receiver_id'],
    });
    if (rows.length === 0) return [];

    await db.GameInvite.update(
        {
            status: INVITE_STATUS.CANCELLED,
            end_reason: reason,
            decided_at: now(),
            revision: db.sequelize.literal('revision + 1'),
        },
        { where: { id: { [db.Sequelize.Op.in]: rows.map((row) => row.id) } } },
    );

    for (const row of rows) {
        const fresh = await db.GameInvite.findOne({ where: { id: row.id } });
        emitInviteUpdated([row.receiver_id, row.sender_id], toPublicInvite(fresh));
    }
    return rows.map((row) => row.id);
}

// ── AC-06: 수락 결정(첫 트랜잭션) ────────────────────────────────────────────

/**
 * 역사적 수락 결정을 선형화한다(A-10의 1단계).
 *
 * 여기까지 성공하면 status=ACCEPTED + attempt_id + entry_outcome=UNCONFIRMED가 durable하다.
 * **이 시점에는 아직 어떤 Map에도, 어떤 실제 방송 room에도 들어가 있지 않다.**
 *
 * 만료 판정은 이 결정 시점에 한 번만 한다 — 이미 ACCEPTED로 확정된 초대를 나중에 EXPIRED로
 * 되돌리지 않는다.
 *
 * @returns {{ok:true, invite:object, roomId:string, roomInstanceId:string}}
 */
async function recordAcceptDecision({ receiverId, inviteId, attemptId, bootEpoch }) {
    const { db, now } = deps;

    return await db.sequelize.transaction(async (t) => {
        const row0 = await db.GameInvite.findOne({ where: { id: inviteId }, transaction: t });
        if (!row0) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row0.receiver_id !== receiverId) throw createError('초대를 찾을 수 없습니다.', 404);

        // 정렬 계정 잠금 → 초대 행 잠금 순서를 지킨다(차단 트랜잭션과 같은 순서).
        await friendRepository.lockAccountsInOrder([row0.sender_id, row0.receiver_id], { transaction: t });
        await expireDueInvitesForReceiver(db, receiverId, now(), t);

        const row = await db.GameInvite.findOne({
            where: { id: inviteId }, transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);

        // 같은 시도의 재조회는 성공으로 이어간다(응답 유실 재시도).
        if (row.status === INVITE_STATUS.ACCEPTED && row.attempt_id === attemptId) {
            return {
                ok: true, invite: toPublicInvite(row), roomId: row.room_id,
                roomInstanceId: row.room_instance_id, resumed: true,
            };
        }
        if (row.status !== INVITE_STATUS.PENDING) {
            throw createError('이미 처리된 초대입니다.', 409, row.status);
        }
        if (row.boot_epoch !== bootEpoch) {
            // 서버가 재시작됐다 — 옛 방 인스턴스는 복원되지 않으므로 입장 근거가 없다(A-11).
            await row.update({
                status: INVITE_STATUS.CANCELLED, end_reason: 'SERVER_RESTARTED',
                decided_at: now(), revision: row.revision + 1,
            }, { transaction: t });
            throw createError('초대가 더 이상 유효하지 않습니다.', 409, 'SERVER_RESTARTED');
        }
        if (await isBlockedBetween(row.sender_id, row.receiver_id, { transaction: t })) {
            throw createError('차단된 사용자의 초대는 수락할 수 없습니다.', 403, 'BLOCKED');
        }

        await row.update({
            status: INVITE_STATUS.ACCEPTED,
            decided_at: now(),
            revision: row.revision + 1,
            attempt_id: attemptId,
            entry_outcome: ENTRY_OUTCOME.UNCONFIRMED,
        }, { transaction: t });

        return {
            ok: true, invite: toPublicInvite(row), roomId: row.room_id,
            roomInstanceId: row.room_instance_id, resumed: false,
        };
    });
}

// ── AC-06: 확정(두 번째 finalization 트랜잭션) ───────────────────────────────

/**
 * publication 영수증을 확정한다(A-10의 2단계).
 *
 * 같은 User→invite 잠금을 **다시** 잡고, 그 안에서 최종 차단·권한·attempt를 확인한 뒤
 * 호출자가 넘긴 동기 publish()를 실행한다. publish()는 room.players·playerRoom·메모리
 * 영수증을 await 없이 한꺼번에 기록해야 한다 — 그 사이에 다른 콜백이 끼어들면 정원·소속
 * 검사가 무의미해진다.
 *
 * publish 이후 영수증 쓰기가 실패하면 unpublish()를 **동기적으로** 불러 방금 넣은 두 Map을
 * 되돌린다. 그 보상까지 실패해도 마지막 durable 상태(UNCONFIRMED)는 보존하고, stale Map은
 * DB와 무관하게 제거한다.
 *
 * @param {() => {ok:boolean, code?:string}} publish 동기 커밋 콜백
 * @param {() => void} unpublish 동기 보상 콜백
 */
async function finalizeAcceptedEntry({ receiverId, inviteId, attemptId, bootEpoch, publish, unpublish }) {
    const { db, now } = deps;
    let publishedInTransaction = false;

    try {
        return await db.sequelize.transaction(async (t) => {
            const row0 = await db.GameInvite.findOne({ where: { id: inviteId }, transaction: t });
            if (!row0) return { ok: false, code: 'INVITE_NOT_FOUND', published: false };

            await friendRepository.lockAccountsInOrder([row0.sender_id, row0.receiver_id], { transaction: t });

            const row = await db.GameInvite.findOne({
                where: { id: inviteId }, transaction: t, lock: t.LOCK.UPDATE,
            });
            if (!row) return { ok: false, code: 'INVITE_NOT_FOUND', published: false };
            if (row.receiver_id !== receiverId) return { ok: false, code: 'NOT_RECEIVER', published: false };
            if (row.attempt_id !== attemptId) return { ok: false, code: 'STALE_ATTEMPT', published: false };
            if (row.boot_epoch !== bootEpoch) return { ok: false, code: 'SERVER_RESTARTED', published: false };
            if (row.status !== INVITE_STATUS.ACCEPTED) return { ok: false, code: 'NOT_ACCEPTED', published: false };
            // 같은 시도가 이미 확정됐으면 그대로 성공이다(응답 유실 재시도).
            if (row.entry_outcome === ENTRY_OUTCOME.PUBLISHED) {
                return { ok: true, invite: toPublicInvite(row), alreadyPublished: true };
            }
            if (row.entry_outcome !== ENTRY_OUTCOME.UNCONFIRMED) {
                return { ok: false, code: 'ENTRY_ALREADY_RESOLVED', published: false };
            }

            const receiver = await lockReceiver(db, receiverId, t);
            if (!receiver || receiver.status !== 'ACTIVE') {
                await row.update({ entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: 'ACCOUNT_UNAVAILABLE' }, { transaction: t });
                return { ok: false, code: 'ACCOUNT_UNAVAILABLE', published: false };
            }

            // 두 번째 잠금 전에 차단이 커밋됐으면 **역사적 ACCEPTED는 유지**하고 entry만
            // INTERRUPTED로 끝낸다 — 결정 자체를 되돌리지 않는다(A-10).
            if (await isBlockedBetween(row.sender_id, row.receiver_id, { transaction: t })) {
                await row.update({ entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: 'BLOCKED_BEFORE_ENTRY' }, { transaction: t });
                return { ok: false, code: 'BLOCKED', published: false };
            }

            // ── 여기부터 await 없는 동기 구간 ────────────────────────────────
            const committed = publish();
            if (!committed || committed.ok !== true) {
                const code = committed?.code ?? 'ROOM_STATE_CHANGED';
                await row.update({ entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: code }, { transaction: t });
                return { ok: false, code, published: false };
            }
            publishedInTransaction = true;

            await row.update({
                entry_outcome: ENTRY_OUTCOME.PUBLISHED,
                decided_at: row.decided_at ?? now(),
            }, { transaction: t });

            return { ok: true, invite: toPublicInvite(row), alreadyPublished: false };
        });
    } catch (error) {
        // 커밋 실패·영수증 쓰기 실패 — Map만 먼저 반영된 상태를 남기지 않는다.
        if (publishedInTransaction) {
            try { unpublish?.(); } catch (compensationError) {
                console.error('[초대 입장 보상 실패]', compensationError);
            }
        }
        console.error('[초대 입장 확정 실패]', error);
        return { ok: false, code: 'RECEIPT_FAILED', published: publishedInTransaction, unknown: true };
    }
}

/**
 * 시도 결과를 다시 묻는다(응답 유실 후 재조회).
 *
 * **현재 소속은 여기서 알 수 없다.** durable 상태만 돌려주고, 성공 판정은 호출자가 현재
 * canonical membership과 대조해서 한다(A-10).
 */
async function getAttemptOutcome({ receiverId, inviteId, attemptId }) {
    const { db } = deps;
    const row = await db.GameInvite.findOne({ where: { id: inviteId } });
    if (!row || row.receiver_id !== receiverId) return { known: false };
    if (attemptId !== undefined && row.attempt_id !== attemptId) {
        return { known: true, staleAttempt: true, invite: toPublicInvite(row) };
    }
    return {
        known: true,
        staleAttempt: false,
        invite: toPublicInvite(row),
        roomId: row.room_id,
        roomInstanceId: row.room_instance_id,
        bootEpoch: row.boot_epoch,
        entryOutcome: row.entry_outcome ?? null,
    };
}

/**
 * 확정 실패를 durable 상태에 기록한다(보상). 실패해도 던지지 않는다 — 이미 제거된 stale
 * Map을 DB 결과에 따라 되살리지 않기 위해서다.
 */
async function recordEntryInterrupted({ inviteId, attemptId, reason }) {
    const { db } = deps;
    try {
        const row = await db.GameInvite.findOne({ where: { id: inviteId } });
        if (!row || row.attempt_id !== attemptId) return false;
        // PUBLISHED를 보상으로 덮어쓰지 않는다 — 확정된 영수증은 역사다.
        if (row.entry_outcome === ENTRY_OUTCOME.PUBLISHED) return false;
        await row.update({ entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: reason ?? 'INTERRUPTED' });
        return true;
    } catch (error) {
        console.error('[초대 입장 보상 기록 실패]', error);
        return false;
    }
}

module.exports = {
    INVITE_TTL_MS,
    INVITE_STATUS,
    ENTRY_OUTCOME,
    toPublicInvite,
    compareSeq,
    createInvite,
    getReceiverSnapshot,
    getInviteForUser,
    declineInvite,
    cancelPendingInvitesBetween,
    cancelPendingInvitesForRoom,
    recordAcceptDecision,
    finalizeAcceptedEntry,
    getAttemptOutcome,
    recordEntryInterrupted,
    emitInviteUpdated,
    __setRoomAccessForRuntime,
    __internal: {
        __setDepsForTests(overrides) { deps = buildDeps(overrides ?? {}); },
        __getRoomAccess() { return roomAccess; },
    },
};
