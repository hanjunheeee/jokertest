'use strict';

// 게임 초대 입장 파일, 수락 결정 · 입장 확정 · 결과 · 중단 기록
// socket/matchmaking/admission/accept.js·attempts.js가 단계마다 부름 (부팅 epoch·시도 id로 옛 시도 거절)
const friendshipRepository = require('../../../repositories/friend/friendship');
const { createError } = require('../../../utils/appError');
const { getDeps } = require('./deps');
const { expireDueInvites, isBlockedBetween, lockReceiver } = require('./guards');
const { INVITE_STATUS, ENTRY_OUTCOME } = require('./constants');
const { toPublicInvite } = require('./view');
const gameInviteRepository = require('../../../repositories/friend/gameInvite');
const { withTransaction } = require('../../../repositories/common');

// 대기 초대를 이 시도로 수락 결정 (다른 시도가 먼저면 거절)
async function recordAcceptDecision({ receiverId, inviteId, attemptId, bootEpoch }) {
    const { db, now } = getDeps();

    const decision = await withTransaction(db, async (t) => {
        // 잠글 계정 알려고 먼저 잠금 없이 읽음, 없거나 내 초대 아니면 404
        const row0 = await gameInviteRepository.findInviteInTransaction(db, inviteId, t);
        if (!row0) throw createError('초대를 찾을 수 없습니다.', 404);
        if (row0.receiver_id !== receiverId) throw createError('초대를 찾을 수 없습니다.', 404);

        // 두 계정 순서대로 잠금 → 시간 지난 초대 만료 → 초대 잠가 다시 읽음
        await friendshipRepository.lockAccountsInOrder([row0.sender_id, row0.receiver_id], { transaction: t });
        await expireDueInvites(db, receiverId, now(), t);

        const row = await gameInviteRepository.lockInvite(db, inviteId, t);
        if (!row) throw createError('초대를 찾을 수 없습니다.', 404);

        // 같은 시도로 이미 수락했으면 이어서 진행 (다시 불러도 안전)
        if (row.status === INVITE_STATUS.ACCEPTED && row.attempt_id === attemptId) {
            return {
                ok: true, invite: toPublicInvite(row), roomId: row.room_id,
                roomInstanceId: row.room_instance_id, resumed: true,
            };
        }
        // 대기 아니면 409 (지금 상태를 코드로)
        if (row.status !== INVITE_STATUS.PENDING) {
            return { rejection: createError('이미 처리된 초대입니다.', 409, row.status) };
        }
        // 서버 다시 켜기 전 초대면 취소 저장 뒤 거절 (던지면 저장도 되돌려지므로 돌려줌)
        if (row.boot_epoch !== bootEpoch) {
            await gameInviteRepository.saveInvite(row, {
                status: INVITE_STATUS.CANCELLED, end_reason: 'SERVER_RESTARTED',
                decided_at: now(), revision: row.revision + 1,
            }, t);
            return { rejection: createError('초대가 더 이상 유효하지 않습니다.', 409, 'SERVER_RESTARTED') };
        }
        // 그사이 차단됐으면 403 (차단 행 공유 잠금)
        if (await isBlockedBetween(row.sender_id, row.receiver_id, { transaction: t, lock: t.LOCK.SHARE })) {
            throw createError('차단된 사용자의 초대는 수락할 수 없습니다.', 403, 'BLOCKED');
        }

        // 여기부터 진짜 바뀜: 이 시도로 수락, 입장은 확인 전
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
    // 거절은 커밋 뒤에 던짐 (만료·취소 저장 지키려고)
    if (decision.rejection) throw decision.rejection;
    return decision;
}

// 입장 확정: 방에 넣기(publish) 되면 입장됨 기록, 커밋 실패면 unpublish로 되돌림
async function finalizeAcceptedEntry({ receiverId, inviteId, attemptId, bootEpoch, publish, unpublish }) {
    const { db, now } = getDeps();
    // 방에 넣은 뒤 실패했는지 알려고 표시
    let publishedInTransaction = false;

    try {
        return await withTransaction(db, async (t) => {
            // 잠글 계정 알려고 먼저 잠금 없이 읽음
            const row0 = await gameInviteRepository.findInviteInTransaction(db, inviteId, t);
            if (!row0) return { ok: false, code: 'INVITE_NOT_FOUND', published: false };

            await friendshipRepository.lockAccountsInOrder([row0.sender_id, row0.receiver_id], { transaction: t });

            // 잠가 다시 읽고 받는 사람·시도·부팅·수락 상태 확인
            const row = await gameInviteRepository.lockInvite(db, inviteId, t);
            if (!row) return { ok: false, code: 'INVITE_NOT_FOUND', published: false };
            if (row.receiver_id !== receiverId) return { ok: false, code: 'NOT_RECEIVER', published: false };
            if (row.attempt_id !== attemptId) return { ok: false, code: 'STALE_ATTEMPT', published: false };
            if (row.boot_epoch !== bootEpoch) return { ok: false, code: 'SERVER_RESTARTED', published: false };
            if (row.status !== INVITE_STATUS.ACCEPTED) return { ok: false, code: 'NOT_ACCEPTED', published: false };
            // 이미 입장 확정이면 그대로 성공 (다시 불러도 안전)
            if (row.entry_outcome === ENTRY_OUTCOME.PUBLISHED) {
                return { ok: true, invite: toPublicInvite(row), alreadyPublished: true };
            }
            // 이미 중단으로 끝났으면 거절
            if (row.entry_outcome !== ENTRY_OUTCOME.UNCONFIRMED) {
                return { ok: false, code: 'ENTRY_ALREADY_RESOLVED', published: false };
            }

            // 계정이 활성 아니면 중단 기록하고 실패
            const receiver = await lockReceiver(db, receiverId, t);
            if (!receiver || receiver.status !== 'ACTIVE') {
                await gameInviteRepository.saveInvite(row, { entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: 'ACCOUNT_UNAVAILABLE' }, t);
                return { ok: false, code: 'ACCOUNT_UNAVAILABLE', published: false };
            }

            // 그사이 차단됐으면 중단 기록하고 실패
            if (await isBlockedBetween(row.sender_id, row.receiver_id, { transaction: t, lock: t.LOCK.SHARE })) {
                await gameInviteRepository.saveInvite(row, { entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: 'BLOCKED_BEFORE_ENTRY' }, t);
                return { ok: false, code: 'BLOCKED', published: false };
            }

            // 여기부터 진짜 바뀜: 방에 넣기, 안 되면 중단 기록
            const committed = publish();
            if (!committed || committed.ok !== true) {
                const code = committed?.code ?? 'ROOM_STATE_CHANGED';
                await gameInviteRepository.saveInvite(row, { entry_outcome: ENTRY_OUTCOME.INTERRUPTED, end_reason: code }, t);
                return { ok: false, code, published: false };
            }
            publishedInTransaction = true;

            // 방에 넣었으면 입장 확정 기록
            await gameInviteRepository.saveInvite(row, {
                entry_outcome: ENTRY_OUTCOME.PUBLISHED,
                decided_at: row.decided_at ?? now(),
            }, t);

            return { ok: true, invite: toPublicInvite(row), alreadyPublished: false };
        });
    } catch (error) {
        // 커밋 실패: 방에 넣었으면 되돌리고, 결과 모름으로 답함
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
    // 없거나 내 초대 아니면 모름
    const row = await gameInviteRepository.findInvite(db, inviteId);
    if (!row || row.receiver_id !== receiverId) return { known: false };
    // 시도 id 주고 다르면 옛 시도라고 알림
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

// 입장 중 끊기면 중단 기록 (그 시도가 아직 확인 전일 때만)
async function recordEntryInterrupted({ inviteId, attemptId, reason }) {
    const { db } = getDeps();
    // 시도 id 없으면 기록 안 함
    if (typeof attemptId !== 'string' || attemptId.length === 0) return false;
    // 실패해도 false만 (끊김 정리 중이라 안 던짐)
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
