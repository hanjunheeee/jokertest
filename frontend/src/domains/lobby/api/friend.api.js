// 친구 도메인에서 사용하는 API 요청 함수들입니다.
// 실제 fetch 처리, 쿠키 포함 설정, 에러 처리는 shared api 클라이언트가 담당합니다.
import { api } from "@/shared/api/client";

// 내 친구 목록을 조회합니다.
export const fetchMyFriends = async () => {
    return await api.get("/friends");
};

// 나에게 들어온 친구 요청 목록을 조회합니다.
export const fetchIncomingRequests = async () => {
    return await api.get("/friends/requests/incoming");
};

// 닉네임/이메일 같은 검색어로 친구 추가 후보를 찾습니다.
// 검색어는 URL에 들어가므로 encodeURIComponent로 안전하게 변환합니다.
export const searchFriendCandidates = async (query) => {
    return await api.get(`/friends/search?q=${encodeURIComponent(query)}`);
};

// 특정 사용자에게 친구 요청을 보냅니다.
// receiverId는 친구 요청을 받을 사용자 id입니다.
export const sendFriendRequest = async (receiverId) => {
    return await api.post("/friends/requests", { receiverId });
};

// 받은 친구 요청을 수락합니다.
// requestId는 수락할 친구 요청 id입니다.
export const acceptFriendRequest = async (requestId) => {
    return await api.put(`/friends/requests/${requestId}/accept`);
};

// 받은 친구 요청을 거절합니다.
// requestId는 거절할 친구 요청 id입니다.
export const declineFriendRequest = async (requestId) => {
    return await api.put(`/friends/requests/${requestId}/decline`);
};

// F-19(AC-02): 전체 수락 응답이 유실됐을 때 "성공인지 실패인지"를 서버에 되묻습니다.
// 요청 당사자만 자기 요청의 상태를 볼 수 있고, 이 조회는 아무 상태도 바꾸지 않습니다.
export const fetchFriendRequestResults = async (requestIds) => {
    const ids = requestIds.map((id) => String(id)).join(",");
    return await api.get(`/friends/requests/results?ids=${encodeURIComponent(ids)}`);
};

// F-19(AC-03): 즐겨찾기는 계정별 서버 값입니다. 재접속·다른 브라우저에서도 이 조회로 복원됩니다.
export const fetchFavoriteFriendIds = async () => {
    return await api.get("/friends/favorites");
};

// 원하는 값(true/false)을 그대로 저장합니다 — toggle 명령이 아니라서 재전송이 상태를
// 뒤집지 않습니다(멱등).
export const setFriendFavoriteApi = async (friendId, favorite) => {
    return await api.put(`/friends/favorites/${encodeURIComponent(friendId)}`, { favorite });
};

// F-19(AC-04): 차단 목록·차단·해제.
export const fetchBlockedUsers = async () => {
    return await api.get("/friends/blocks");
};

export const blockUserApi = async (targetId) => {
    return await api.post("/friends/blocks", { targetId });
};

export const unblockUserApi = async (targetId) => {
    return await api.delete(`/friends/blocks/${encodeURIComponent(targetId)}`);
};

// F-19(AC-06/AC-07): 초대 목록 snapshot과 소리 커서를 한 번에 받습니다.
// 커서는 종료된 초대까지 포함한 전체 최대 순번이라, 이 값 이하 사건은 전부 무음입니다.
export const fetchGameInviteSnapshot = async () => {
    return await api.get("/friends/invites");
};

// 초대를 보냅니다. 발송자와 방은 서버가 registry에서 확정하므로 여기서 방 정보를 싣지
// 않습니다 — creationKey는 응답 유실 재시도가 두 번째 초대를 만들지 않게 하는 멱등 키입니다.
export const createGameInviteApi = async (receiverId, creationKey) => {
    return await api.post("/friends/invites", { receiverId, creationKey });
};

export const fetchGameInviteApi = async (inviteId) => {
    return await api.get(`/friends/invites/${encodeURIComponent(inviteId)}`);
};

export const declineGameInviteApi = async (inviteId) => {
    return await api.post(`/friends/invites/${encodeURIComponent(inviteId)}/decline`);
};
