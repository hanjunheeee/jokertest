/**
 * @file friend.js
 * @desc 친구 목록 · 검색 · 요청 전송/수락/거절 API 함수
 */

import { api } from "@/shared/api/client";

// GET /friends — 내 친구 목록 조회
export const fetchMyFriends          = async ()          => api.get("/friends");
// GET /friends/requests/incoming — 내가 받은(수락 대기 중인) 친구 요청 목록 조회
export const fetchIncomingRequests   = async ()          => api.get("/friends/requests/incoming");
// GET /friends/search?q=... — 닉네임/ID로 친구 후보 검색
export const searchFriendCandidates  = async (query)     => api.get(`/friends/search?q=${encodeURIComponent(query)}`);
// POST /friends/requests — receiverId에게 친구 요청 전송
export const sendFriendRequest       = async (receiverId) => api.post("/friends/requests", { receiverId });
// PUT /friends/requests/:requestId/accept — 받은 요청 수락
export const acceptFriendRequest     = async (requestId)  => api.put(`/friends/requests/${requestId}/accept`);
// PUT /friends/requests/:requestId/decline — 받은 요청 거절
export const declineFriendRequest    = async (requestId)  => api.put(`/friends/requests/${requestId}/decline`);
