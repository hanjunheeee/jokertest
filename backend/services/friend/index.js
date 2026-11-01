// 친구 카테고리 입구, 옛 friend.service 이름 13개 + 친구 사건 전송 5개 + 게임 초대 이름 (시험 손잡이 뺌)
// friend 컨트롤러가 이 입구로 부름, 초대는 복사본이라 부를 땐 ./gameInvite 입구 사용
const { getFriendList, searchUsers } = require('./list');
const { assertNotBlocked, getBlockedUsers, blockUser, unblockUser } = require('./blocks');
const { sendFriendRequest, acceptRequest, declineRequest, getIncomingRequests, getRequestResults } = require('./requests');
const { getFavoriteFriendIds, setFriendFavorite } = require('./favorites');
// 컨트롤러에서 옮긴 친구 사건 전송 (효과음 사건 포함)
const { notifyRequestReceived, notifyRequestAccepted, notifyRequestDeclined, notifyBlocked, notifyUnblocked } = require('./notify');
// 게임 초대 이름도 하나씩 모음, 시험 손잡이(__internal·__setRoomAccessForRuntime)는 ./gameInvite 입구에서만
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
