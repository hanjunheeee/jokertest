'use strict';

const crypto = require('node:crypto');

const friendRepository = require('../repositories/friend.repositories');
const notificationService = require('./notification.service');
const { createError } = require('../utils/appError');

const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../models'); },
    get emitToUser() {
        if (overrides.emitToUser) return overrides.emitToUser;
        try {
            return require('../socket/emitter').emitToUser;
        } catch {
            return null;
        }
    },
    get newId() { return overrides.newId ?? (() => crypto.randomUUID()); },
    get now() { return overrides.now ?? (() => new Date()); },
});

let deps = buildDeps();

const INVITE_TTL_MS = 3 * 60 * 1000;

const INVITE_STATUS = Object.freeze({
    PENDING: 'PENDING',
    ACCEPTED: 'ACCEPTED',
    DECLINED: 'DECLINED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
});

const ENTRY_OUTCOME = Object.freeze({
    UNCONFIRMED: 'UNCONFIRMED',
    PUBLISHED: 'PUBLISHED',
    INTERRUPTED: 'INTERRUPTED',
});

const NO_ROOM_ACCESS = Object.freeze({
    bootEpoch: 'unbound',
    describeRoomForInvite: () => null,
    getRoomIdForUser: () => null,
    describeReceiverAvailability: () => ({ available: false, code: 'ROOM_ACCESS_UNAVAILABLE' }),
});

let roomAccess = NO_ROOM_ACCESS;

function __setRoomAccessForRuntime(access) {
    roomAccess = access ?? NO_ROOM_ACCESS;
}

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

const compareSeq = (left, right) => {
    const a = String(left ?? '0').replace(/^0+(?=\d)/, '');
    const b = String(right ?? '0').replace(/^0+(?=\d)/, '');
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
};

const lockReceiver = async (db, receiverId, transaction) => {
    return await db.User.findOne({
        where: { uuid: receiverId },
        attributes: ['uuid', 'nickname', 'status'],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
};

const isBlockedBetween = async (uuidA, uuidB, options = {}) => {
    const blocks = await friendRepository.findBlocksBetween(uuidA, uuidB, options);
    return blocks.length > 0;
};

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

    const requireSenderRoom = (expected = null) => {
        const currentId = roomAccess.getRoomIdForUser(senderId);
        const current = currentId ? roomAccess.describeRoomForInvite(currentId) : null;
        if (!current) throw createError('초대를 보낼 대기방이 없습니다.', 409);
        if (current.isFull) throw createError('방이 가득 차 초대를 보낼 수 없습니다.', 409);
        if (expected !== null
            && (current.roomId !== expected.roomId || current.roomInstanceId !== expected.roomInstanceId)) {
            throw createError('대기방 상태가 바뀌어 초대를 보내지 못했습니다.', 409, 'ROOM_STATE_CHANGED');
        }
        return current;
    };

    requireSenderRoom();

    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + INVITE_TTL_MS);
    const bootEpoch = roomAccess.bootEpoch;

    const result = await db.sequelize.transaction(async (t) => {
        const locked = await friendRepository.lockAccountsInOrder([senderId, receiverId], { transaction: t });
        const lockedByUuid = new Map(locked.filter(Boolean).map((row) => [row.uuid, row]));
        if (!lockedByUuid.get(senderId)) throw createError('사용자를 찾을 수 없습니다.', 404);
        const receiver = lockedByUuid.get(receiverId);
        if (!receiver) throw createError('초대할 사용자를 찾을 수 없습니다.', 404);
        if (receiver.status !== 'ACTIVE') throw createError('초대할 수 없는 계정입니다.', 403);

        const room = requireSenderRoom();

        const existing = await db.GameInvite.findOne({
            where: { sender_id: senderId, creation_key: normalizedKey },
            transaction: t,
        });
        if (existing) {
            if (existing.receiver_id !== receiverId || existing.room_id !== room.roomId) {
                throw createError('같은 생성 키로 다른 초대를 보낼 수 없습니다.', 409);
            }
            return { invite: existing, created: false, notification: null, senderNickname: null };
        }

        if (await isBlockedBetween(senderId, receiverId, { transaction: t })) {
            throw createError('차단된 사용자에게는 게임 초대를 보낼 수 없습니다.', 403);
        }

        const friendship = await friendRepository.findExistingFriendship(senderId, receiverId, { transaction: t });
        if (!friendship || friendship.status !== 'ACCEPTED') {
            throw createError('친구만 게임에 초대할 수 있습니다.', 403);
        }

        const livePending = await db.GameInvite.findOne({
            where: {
                sender_id: senderId,
                receiver_id: receiverId,
                room_id: room.roomId,
                room_instance_id: room.roomInstanceId,
                boot_epoch: bootEpoch,
                status: INVITE_STATUS.PENDING,
                expires_at: { [db.Sequelize.Op.gt]: createdAt },
            },
            order: [['creation_seq', 'DESC']],
            transaction: t,
        });
        if (livePending) {
            return { invite: livePending, created: false, notification: null, senderNickname: null };
        }

        const availability = roomAccess.describeReceiverAvailability(receiverId);
        if (!availability.available) {
            throw createError('지금은 상대를 초대할 수 없습니다.', 409, availability.code);
        }

        const sender = await db.User.findOne({
            where: { uuid: senderId }, attributes: ['nickname'], transaction: t,
        });

        requireSenderRoom(room);

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

    if (result.created) {
        emitInviteReceived(receiverId, publicInvite);
        if (result.notification !== null) {
            notificationService.emitNotificationCreated(receiverId, result.notification);
        }
    }

    return { invite: publicInvite, created: result.created };
}

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

        if (row.status === INVITE_STATUS.PENDING && row.expires_at.getTime() <= now().getTime()) {
            await lockReceiver(db, row.receiver_id, t);
            await expireDueInvitesForReceiver(db, row.receiver_id, now(), t);
            await row.reload({ transaction: t });
        }

        return toPublicInvite(row);
    });
}

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

async function recordAcceptDecision({ receiverId, inviteId, attemptId, bootEpoch }) {
    const { db, now } = deps;

    const decision = await db.sequelize.transaction(async (t) => {
        const row0 = await db.GameInvite.findOne({ where: { id: inviteId }, transaction: t });
        if (!row0) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row0.receiver_id !== receiverId) throw createError('초대를 찾을 수 없습니다.', 404);

        await friendRepository.lockAccountsInOrder([row0.sender_id, row0.receiver_id], { transaction: t });
        await expireDueInvitesForReceiver(db, receiverId, now(), t);

        const row = await db.GameInvite.findOne({
            where: { id: inviteId }, transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);

        if (row.status === INVITE_STATUS.ACCEPTED && row.attempt_id === attemptId) {
            return {
                ok: true, invite: toPublicInvite(row), roomId: row.room_id,
                roomInstanceId: row.room_instance_id, resumed: true,
            };
        }
        if (row.status !== INVITE_STATUS.PENDING) {
            return { rejection: createError('이미 처리된 초대입니다.', 409, row.status) };
        }
        if (row.boot_epoch !== bootEpoch) {
            await row.update({
                status: INVITE_STATUS.CANCELLED, end_reason: 'SERVER_RESTARTED',
                decided_at: now(), revision: row.revision + 1,
            }, { transaction: t });
            return { rejection: createError('초대가 더 이상 유효하지 않습니다.', 409, 'SERVER_RESTARTED') };
        }
        if (await isBlockedBetween(row.sender_id, row.receiver_id, { transaction: t, lock: t.LOCK.SHARE })) {
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
    if (decision.rejection) throw decision.rejection;
    return decision;
}

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

            if (await isBlockedBetween(row.sender_id, row.receiver_id, { transaction: t, lock: t.LOCK.SHARE })) {
                await row.update({ entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: 'BLOCKED_BEFORE_ENTRY' }, { transaction: t });
                return { ok: false, code: 'BLOCKED', published: false };
            }

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
        if (publishedInTransaction) {
            try { unpublish?.(); } catch (compensationError) {
                console.error('[초대 입장 보상 실패]', compensationError);
            }
        }
        console.error('[초대 입장 확정 실패]', error);
        return { ok: false, code: 'RECEIPT_FAILED', published: publishedInTransaction, unknown: true };
    }
}

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

async function recordEntryInterrupted({ inviteId, attemptId, reason }) {
    const { db } = deps;
    if (typeof attemptId !== 'string' || attemptId.length === 0) return false;
    try {
        const [affected] = await db.GameInvite.update(
            { entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: reason ?? 'INTERRUPTED' },
            {
                where: {
                    id: inviteId,
                    attempt_id: attemptId,
                    entry_outcome: ENTRY_OUTCOME.UNCONFIRMED,
                },
            },
        );
        return Number(affected) > 0;
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
