import { api } from "@/shared/api/client";

export const fetchMyFriends = async () => {
    return await api.get("/friends");
};

export const fetchIncomingRequests = async () => {
    return await api.get("/friends/requests/incoming");
};

export const searchFriendCandidates = async (query) => {
    return await api.get(`/friends/search?q=${encodeURIComponent(query)}`);
};

export const sendFriendRequest = async (receiverId) => {
    return await api.post("/friends/requests", { receiverId });
};

export const acceptFriendRequest = async (requestId) => {
    return await api.put(`/friends/requests/${requestId}/accept`);
};

export const declineFriendRequest = async (requestId) => {
    return await api.put(`/friends/requests/${requestId}/decline`);
};

export const fetchFriendRequestResults = async (requestIds) => {
    const ids = requestIds.map((id) => String(id)).join(",");
    return await api.get(`/friends/requests/results?ids=${encodeURIComponent(ids)}`);
};

export const fetchFavoriteFriendIds = async () => {
    return await api.get("/friends/favorites");
};

export const setFriendFavoriteApi = async (friendId, favorite) => {
    return await api.put(`/friends/favorites/${encodeURIComponent(friendId)}`, { favorite });
};

export const fetchBlockedUsers = async () => {
    return await api.get("/friends/blocks");
};

export const blockUserApi = async (targetId) => {
    return await api.post("/friends/blocks", { targetId });
};

export const unblockUserApi = async (targetId) => {
    return await api.delete(`/friends/blocks/${encodeURIComponent(targetId)}`);
};

export const fetchGameInviteSnapshot = async () => {
    return await api.get("/friends/invites");
};

export const createGameInviteApi = async (receiverId, creationKey) => {
    return await api.post("/friends/invites", { receiverId, creationKey });
};

export const fetchGameInviteApi = async (inviteId) => {
    return await api.get(`/friends/invites/${encodeURIComponent(inviteId)}`);
};

export const declineGameInviteApi = async (inviteId) => {
    return await api.post(`/friends/invites/${encodeURIComponent(inviteId)}/decline`);
};
