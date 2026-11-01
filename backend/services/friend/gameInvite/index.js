'use strict';

// 게임 초대 입구, 옛 gameInvite.service와 같은 이름만 골라 내보냄
// friend 컨트롤러·친구 차단·matchmaking 수락 흐름이 이 입구로 부름 (시험 손잡이도 여기)
const { INVITE_TTL_MS, INVITE_STATUS, ENTRY_OUTCOME } = require('./constants');
const { toPublicInvite, compareSeq } = require('./view');
const { createInvite } = require('./create');
const { getReceiverSnapshot, getInviteForUser } = require('./queries');
const { declineInvite, cancelPendingInvitesBetween, cancelPendingInvitesForRoom } = require('./cancel');
const { recordAcceptDecision, finalizeAcceptedEntry, getAttemptOutcome, recordEntryInterrupted } = require('./entry');
const { emitInviteUpdated } = require('./notify');
const { __setRoomAccessForRuntime, __internal } = require('./deps');

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
    __internal,
};
