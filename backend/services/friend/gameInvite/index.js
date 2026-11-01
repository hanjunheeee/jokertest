'use strict';

// 게임 초대 입구, 초대 기능·상수 + 시험 손잡이 내보냄
// controllers/friend.controller.js·friend/blocks.js·friend/index.js·socket/matchmaking.js·socket/matchmaking/core/deps.js가 부름
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
