// 친구 컨트롤러 입구, 목록·신청 / 즐겨찾기·차단 / 친구 끊기 / 게임 초대 처리기를 이름 하나씩 내보냄
// routes/friend.routes.js·시험이 부름
const {
    getFriends, getIncomingRequests, getOutgoingRequests, searchUsers,
    sendFriendRequest, acceptRequest, declineRequest, cancelRequest, getRequestResults,
} = require("./requests");
const { getFavorites, setFavorite, getBlocks, blockUser, unblockUser } = require("./relations");
const { unfriend } = require("./unfriend");
const { getInviteSnapshot, createInvite, getInvite, declineInvite } = require("./invites");

module.exports = {
    getFriends,
    getIncomingRequests,
    getOutgoingRequests,
    searchUsers,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    getRequestResults,
    getFavorites,
    setFavorite,
    getBlocks,
    blockUser,
    unblockUser,
    unfriend,
    getInviteSnapshot,
    createInvite,
    getInvite,
    declineInvite,
};
