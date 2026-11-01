'use strict';

// 게임 초대 입장 파일, 수락 결정 · 입장 확정 · 결과 · 중단 기록
// matchmaking 초대 수락 흐름이 단계마다 부름 (부팅 epoch·시도 id로 옛 시도 거절)
const friendRepository = require('../../../repositories/friend.repositories');
const { createError } = require('../../../utils/appError');
const { getDeps } = require('./deps');
const { expireDueInvitesForReceiver, isBlockedBetween, lockReceiver } = require('./guards');
const { INVITE_STATUS, ENTRY_OUTCOME } = require('./constants');
const { toPublicInvite } = require('./view');
const gameInviteRepository = require('../../../repositories/friend/gameInvite');
const { withTransaction } = require('../../../repositories/common');

// 대기 초대를 이 시도로 수락 결정 (다른 시도가 먼저면 거절)
async function recordAcceptDecision({ receiverId, inviteId, attemptId, bootEpoch }) {
    const { db, now } = getDeps();

    const decision = await withTransaction(db, async (t) => {
        const row0 = await gameInviteRepository.findInviteInTransaction(db, inviteId, t);
        if (!row0) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row0.receiver_id !== receiverId) throw createError('초대를 찾을 수 없습니다.', 404);

        await friendRepository.lockAccountsInOrder([row0.sender_id, row0.receiver_id], { transaction: t });
        await expireDueInvitesForReceiver(db, receiverId, now(), t);

        const row = await gameInviteRepository.lockInvite(db, inviteId, t);
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
            await gameInviteRepository.saveInvite(row, {
                status: INVITE_STATUS.CANCELLED, end_reason: 'SERVER_RESTARTED',
                decided_at: now(), revision: row.revision + 1,
            }, t);
            return { rejection: createError('초대가 더 이상 유효하지 않습니다.', 409, 'SERVER_RESTARTED') };
        }
        if (await isBlockedBetween(row.sender_id, row.receiver_id, { transaction: t, lock: t.LOCK.SHARE })) {
            throw createError('차단된 사용자의 초대는 수락할 수 없습니다.', 403, 'BLOCKED');
        }

        await gameInviteRepository.saveInvite(row, {
            status: INVITE_STATUS.ACCEPTED,
            decided_at: now(),
            revision: row.revision + 1,
            attempt_id: attemptId,
            entry_outcome: ENTRY_OUTCOME.UNCONFIRMED,
        }, t);

        return {
            ok: true, invite: toPublicInvite(row), roomId: row.room_id,
            roomInstanceId: row.room_instance_id, resumed: false,
        };
    });
    if (decision.rejection) throw decision.rejection;
    return decision;
}

// 방 입장 성공하면 확정, 실패하면 되돌림 콜백 부름
async function finalizeAcceptedEntry({ receiverId, inviteId, attemptId, bootEpoch, publish, unpublish }) {
    const { db, now } = getDeps();
    let publishedInTransaction = false;

    try {
        return await withTransaction(db, async (t) => {
            const row0 = await gameInviteRepository.findInviteInTransaction(db, inviteId, t);
            if (!row0) return { ok: false, code: 'INVITE_NOT_FOUND', published: false };

            await friendRepository.lockAccountsInOrder([row0.sender_id, row0.receiver_id], { transaction: t });

            const row = await gameInviteRepository.lockInvite(db, inviteId, t);
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
                await gameInviteRepository.saveInvite(row, { entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: 'ACCOUNT_UNAVAILABLE' }, t);
                return { ok: false, code: 'ACCOUNT_UNAVAILABLE', published: false };
            }

            if (await isBlockedBetween(row.sender_id, row.receiver_id, { transaction: t, lock: t.LOCK.SHARE })) {
                await gameInviteRepository.saveInvite(row, { entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: 'BLOCKED_BEFORE_ENTRY' }, t);
                return { ok: false, code: 'BLOCKED', published: false };
            }

            const committed = publish();
            if (!committed || committed.ok !== true) {
                const code = committed?.code ?? 'ROOM_STATE_CHANGED';
                await gameInviteRepository.saveInvite(row, { entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: code }, t);
                return { ok: false, code, published: false };
            }
            publishedInTransaction = true;

            await gameInviteRepository.saveInvite(row, {
                entry_outcome: ENTRY_OUTCOME.PUBLISHED,
                decided_at: row.decided_at ?? now(),
            }, t);

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

// 응답 놓친 시도의 결과 다시 묻기
async function getAttemptOutcome({ receiverId, inviteId, attemptId }) {
    const { db } = getDeps();
    const row = await gameInviteRepository.findInvite(db, inviteId);
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

// 입장 중 끊기면 중단으로 기록
async function recordEntryInterrupted({ inviteId, attemptId, reason }) {
    const { db } = getDeps();
    if (typeof attemptId !== 'string' || attemptId.length === 0) return false;
    try {
        const [affected] = await gameInviteRepository.markEntryIfUnconfirmed(db, {
            inviteId,
            attemptId,
            entryOutcome: ENTRY_OUTCOME.INTERRUPTED,
            endReason: reason ?? 'INTERRUPTED',
            unconfirmedOutcome: ENTRY_OUTCOME.UNCONFIRMED,
        });
        return Number(affected) > 0;
    } catch (error) {
        console.error('[초대 입장 보상 기록 실패]', error);
        return false;
    }
}

module.exports = {
    recordAcceptDecision,
    finalizeAcceptedEntry,
    getAttemptOutcome,
    recordEntryInterrupted,
};
