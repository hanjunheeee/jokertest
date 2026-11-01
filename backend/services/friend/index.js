// 친구 카테고리 입구, 옛 friend.service 이름 13개 + 게임 초대 이름 (시험 손잡이 뺌)
// friend 컨트롤러가 이 입구로 부름, 초대는 복사본이라 부를 땐 ./gameInvite 입구 사용
const { getFriendList, searchUsers } = require('./list');
const { assertNotBlocked, getBlockedUsers, blockUser, unblockUser } = require('./blocks');
const { sendFriendRequest, acceptRequest, declineRequest, getIncomingRequests, getRequestResults } = require('./requests');
const { getFavoriteFriendIds, setFriendFavorite } = require('./favorites');
// 게임 초대 이름도 모음, 시험 손잡이(__internal·__setRoomAccessForRuntime)는 ./gameInvite 입구에서만
const { __internal, __setRoomAccessForRuntime, ...gameInvite } = require('./gameInvite');

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
    ...gameInvite,
};
