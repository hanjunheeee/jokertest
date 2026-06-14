import { api } from "@/shared/api/client";

export const fetchMyFriends = async () => {
    return await api.get("/friends");
}

export const fetchIncomingRequests = async () => {
    return await api.get("/friends/requests/incoming");
}

export const searchFriendCandidates = async (query) => {
    return await api.get(`/friends/search?q=${encodeURIComponent(query)}`);
}

export const sendFriendRequest = async (receiverId) => {
    return await api.post("/friends/requests", { receiverId });
}

export const acceptFriendRequest = async (requestId) => {
    return await api.put(`/friends/requests/${requestId}/accept`);
}

export const declineFriendRequest = async (requestId) => {
    return await api.put(`/friends/requests/${requestId}/decline`);
}
