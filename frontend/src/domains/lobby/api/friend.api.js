// 친구·즐겨찾기·차단·게임 초대 HTTP 요청 모음 (/friends 아래 주소)
// friend·gameInvite 스토어 액션, 친구 검색 훅, 받은 신청 처리(friendSync)가 씀
import { api } from "@/shared/api/client";

// 내 친구 목록 (접속 상태·프로필 꾸미기 id 포함)
export const fetchMyFriends = async () => {
    return await api.get("/friends");
};

// 나에게 온 친구 신청 목록
export const fetchIncomingRequests = async () => {
    return await api.get("/friends/requests/incoming");
};

// 닉네임으로 친구 후보 찾기 (검색어는 주소용으로 감쌈)
export const searchFriendCandidates = async (query) => {
    return await api.get(`/friends/search?q=${encodeURIComponent(query)}`);
};

// 친구 신청 보내기
export const sendFriendRequest = async (receiverId) => {
    return await api.post("/friends/requests", { receiverId });
};

// 받은 친구 신청 수락
export const acceptFriendRequest = async (requestId) => {
    return await api.put(`/friends/requests/${requestId}/accept`);
};

// 받은 친구 신청 거절
export const declineFriendRequest = async (requestId) => {
    return await api.put(`/friends/requests/${requestId}/decline`);
};

// 여러 신청의 처리 결과 한 번에 묻기 (id를 쉼표로 이어 보냄)
export const fetchFriendRequestResults = async (requestIds) => {
    const ids = requestIds.map((id) => String(id)).join(",");
    return await api.get(`/friends/requests/results?ids=${encodeURIComponent(ids)}`);
};

// 즐겨찾기한 친구 id 목록
export const fetchFavoriteFriendIds = async () => {
    return await api.get("/friends/favorites");
};

// 친구 즐겨찾기 켜기·끄기 저장 (서버가 확정한 값을 돌려줌)
export const setFriendFavoriteApi = async (friendId, favorite) => {
    return await api.put(`/friends/favorites/${encodeURIComponent(friendId)}`, { favorite });
};

// 내가 차단한 사용자 목록
export const fetchBlockedUsers = async () => {
    return await api.get("/friends/blocks");
};

// 사용자 차단
export const blockUserApi = async (targetId) => {
    return await api.post("/friends/blocks", { targetId });
};

// 차단 해제
export const unblockUserApi = async (targetId) => {
    return await api.delete(`/friends/blocks/${encodeURIComponent(targetId)}`);
};

// 받은 게임 초대 스냅샷 (초대 줄 + 순번 커서)
export const fetchGameInviteSnapshot = async () => {
    return await api.get("/friends/invites");
};

// 게임 초대 보내기 (같은 creationKey면 서버가 같은 초대로 봄)
export const createGameInviteApi = async (receiverId, creationKey) => {
    return await api.post("/friends/invites", { receiverId, creationKey });
};

// 초대 하나 다시 묻기 (지금은 시험만 씀)
export const fetchGameInviteApi = async (inviteId) => {
    return await api.get(`/friends/invites/${encodeURIComponent(inviteId)}`);
};

// 받은 게임 초대 거절
export const declineGameInviteApi = async (inviteId) => {
    return await api.post(`/friends/invites/${encodeURIComponent(inviteId)}/decline`);
};
