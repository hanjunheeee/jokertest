// 친구 입구, 친구 기능 13개 + 친구 사건 전송 5개 + 게임 초대 이름 16개 (시험 손잡이 뺌)
// controllers/friend.controller.js·시험이 부름, 초대는 다들 ./gameInvite 입구로 바로 부름
const { getFriendList, searchUsers } = require('./list');
const { assertNotBlocked, getBlockedUsers, blockUser, unblockUser } = require('./blocks');
const { sendFriendRequest, acceptRequest, declineRequest, getIncomingRequests, getRequestResults } = require('./requests');
const { getFavoriteFriendIds, setFriendFavorite } = require('./favorites');
// 친구 사건 전송 (효과음 사건 포함, 컨트롤러가 서비스 다음에 부름)
const { notifyRequestReceived, notifyRequestAccepted, notifyRequestDeclined, notifyBlocked, notifyUnblocked } = require('./notify');
// 게임 초대 이름도 모음, 시험 손잡이(__internal·__setRoomAccessForRuntime)는 ./gameInvite 입구에만
const {
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
} = require('./gameInvite');

module.exports = {
    getFriendList,
    searchUsers,
    assertNotBlocked,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    getIncomingRequests,
    getRequestResults,
    getFavoriteFriendIds,
    setFriendFavorite,
    getBlockedUsers,
    blockUser,
    unblockUser,
    notifyRequestReceived,
    notifyRequestAccepted,
    notifyRequestDeclined,
    notifyBlocked,
    notifyUnblocked,
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
};
