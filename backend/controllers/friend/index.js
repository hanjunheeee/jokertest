// 친구 컨트롤러 입구, 목록·신청 / 즐겨찾기·차단 / 게임 초대 처리기를 이름 하나씩 내보냄
// routes/friend.routes.js·시험이 부름
const { getFriends, getIncomingRequests, searchUsers, sendFriendRequest, acceptRequest, declineRequest, getRequestResults } = require("./requests");
const { getFavorites, setFavorite, getBlocks, blockUser, unblockUser } = require("./relations");
const { getInviteSnapshot, createInvite, getInvite, declineInvite } = require("./invites");

module.exports = {
    getFriends,
    getIncomingRequests,
    searchUsers,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    getRequestResults,
    getFavorites,
    setFavorite,
    getBlocks,
    blockUser,
    unblockUser,
    getInviteSnapshot,
    createInvite,
    getInvite,
    declineInvite,
};
