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
