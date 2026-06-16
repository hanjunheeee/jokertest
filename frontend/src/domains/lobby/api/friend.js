/**
 * @file friend.js
 * @desc 친구 목록 · 검색 · 요청 전송/수락/거절 API 함수
 */

import { api } from "@/shared/api/client";

export const fetchMyFriends          = async ()          => api.get("/friends");
export const fetchIncomingRequests   = async ()          => api.get("/friends/requests/incoming");
export const searchFriendCandidates  = async (query)     => api.get(`/friends/search?q=${encodeURIComponent(query)}`);
export const sendFriendRequest       = async (receiverId) => api.post("/friends/requests", { receiverId });
export const acceptFriendRequest     = async (requestId)  => api.put(`/friends/requests/${requestId}/accept`);
export const declineFriendRequest    = async (requestId)  => api.put(`/friends/requests/${requestId}/decline`);
