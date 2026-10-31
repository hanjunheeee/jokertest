import { create } from "zustand";
import {
    blockUserApi,
    fetchBlockedUsers,
    fetchFavoriteFriendIds,
    fetchIncomingRequests as fetchIncomingRequestsApi,
    fetchMyFriends,
    setFriendFavoriteApi,
    unblockUserApi,
} from "../api/friend.api.js";
import { useAuthStore } from "../../auth/store/auth.store.js";

function readAuthAccountId() {
    const auth = useAuthStore.getState();
    return auth.isLoggedIn && typeof auth.user?.uuid === "string" && auth.user.uuid.length > 0
        ? auth.user.uuid
        : null;
}

let writeSeq = 0;
const nextSeq = () => (writeSeq += 1);

let operationSeq = 0;
const nextOperationId = () => (operationSeq += 1);

export const emptyAcceptAllResult = () => ({
    running: false,
    accepted: 0,
    failed: 0,
    unconfirmed: 0,
    refreshError: null,
    completedAt: null,
});

const initialAccountState = () => ({
    friends: [],

    incomingRequests: [],

    sentRequestIds: new Set(),

    resolvedRequestIds: new Set(),

    favoriteFriendIds: new Set(),

    favoritePendingIds: new Set(),

    favoriteErrors: {},

    favoriteWrites: {},

    incomingRemovals: {},

    blockedUsers: [],
    blocksStatus: "idle",
    blocksError: null,

    friendsError: null,
    incomingError: null,
    favoritesError: null,

    processingRequestIds: new Set(),

    requestLockOwners: {},

    acceptAllResult: emptyAcceptAllResult(),

    appliedSeq: { friends: 0, incoming: 0, favorites: 0, blocks: 0 },

    appliedResult: { friends: null, incoming: null, favorites: null, blocks: null },
});

const initialState = () => ({
    accountId: null,
    accountGeneration: 0,
    ...initialAccountState(),
});

export const useFriendStore = create((set, get) => ({
    ...initialState(),

    syncAccount: () => {
        const next = readAuthAccountId();
        const state = get();
        if (state.accountId === next) return state.accountGeneration;

        const accountGeneration = state.accountGeneration + 1;
        set({ accountId: next, accountGeneration, ...initialAccountState() });
        return accountGeneration;
    },

    isCurrent: (accountGeneration) => get().accountGeneration === accountGeneration,

    claimSeq: (key, ticket, outcome = { ok: true }) => {
        if (get().appliedSeq[key] >= ticket) return false;
        set((state) => ({
            appliedSeq: { ...state.appliedSeq, [key]: ticket },
            appliedResult: { ...state.appliedResult, [key]: outcome },
        }));
        return true;
    },

    supersededResult: (key) => {
        const applied = get().appliedResult[key];
        if (applied === null || applied === undefined) {
            return { ok: false, reason: "superseded-unknown", superseded: true };
        }
        return applied.ok
            ? { ok: true, superseded: true }
            : { ok: false, reason: "superseded-error", superseded: true, message: applied.message };
    },

    bumpSeq: (key) => {
        const ticket = nextSeq();
        set((state) => ({
            appliedSeq: { ...state.appliedSeq, [key]: ticket },
            appliedResult: { ...state.appliedResult, [key]: { ok: true } },
        }));
        return ticket;
    },

    fetchFriends: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        try {
            const friendsData = await fetchMyFriends();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (!get().claimSeq("friends", ticket, { ok: true })) return get().supersededResult("friends");
            set({ friends: friendsData, friendsError: null });
            return { ok: true, friends: friendsData };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            const message = error?.message ?? "친구 목록을 불러오지 못했습니다.";
            if (!get().claimSeq("friends", ticket, { ok: false, message })) return get().supersededResult("friends");
            set({ friendsError: message });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    fetchIncomingRequests: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        try {
            const requests = await fetchIncomingRequestsApi();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (!get().claimSeq("incoming", ticket, { ok: true })) return get().supersededResult("incoming");
            set((state) => {
                const pending = {};
                for (const [id, seq] of Object.entries(state.incomingRemovals)) {
                    if (seq > ticket) pending[id] = seq;
                }
                const list = Array.isArray(requests)
                    ? requests.filter((request) => !Object.hasOwn(pending, String(request?.request_id)))
                    : requests;
                return { incomingRequests: list, incomingRemovals: pending, incomingError: null };
            });
            return { ok: true, requests };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            const message = error?.message ?? "받은 친구 신청을 불러오지 못했습니다.";
            if (!get().claimSeq("incoming", ticket, { ok: false, message })) return get().supersededResult("incoming");
            set({ incomingError: message });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    fetchFavorites: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        try {
            const ids = await fetchFavoriteFriendIds();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (!get().claimSeq("favorites", ticket, { ok: true })) return get().supersededResult("favorites");
            set((state) => {
                const next = new Set(Array.isArray(ids) ? ids : []);
                const pending = {};
                for (const [friendId, write] of Object.entries(state.favoriteWrites)) {
                    if (write.seq <= ticket) continue;
                    pending[friendId] = write;
                    if (write.favorite) next.add(friendId); else next.delete(friendId);
                }
                return { favoriteFriendIds: next, favoriteWrites: pending, favoritesError: null };
            });
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            const message = error?.message ?? "즐겨찾기를 불러오지 못했습니다.";
            if (!get().claimSeq("favorites", ticket, { ok: false, message })) return get().supersededResult("favorites");
            set({ favoritesError: message });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    setFavorite: async (friendId, desired) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };

        set((state) => ({
            favoritePendingIds: new Set(state.favoritePendingIds).add(friendId),
            favoriteErrors: Object.fromEntries(
                Object.entries(state.favoriteErrors).filter(([id]) => id !== friendId),
            ),
        }));

        const clearPending = () => set((state) => {
            const next = new Set(state.favoritePendingIds);
            next.delete(friendId);
            return { favoritePendingIds: next };
        });

        try {
            const result = await setFriendFavoriteApi(friendId, desired);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            const confirmed = result?.favorite === true;
            const ticket = nextSeq();
            set((state) => {
                const next = new Set(state.favoriteFriendIds);
                if (confirmed) next.add(friendId); else next.delete(friendId);
                return {
                    favoriteFriendIds: next,
                    favoriteWrites: { ...state.favoriteWrites, [friendId]: { seq: ticket, favorite: confirmed } },
                };
            });
            return { ok: true, favorite: confirmed };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            set((state) => ({
                favoriteErrors: {
                    ...state.favoriteErrors,
                    [friendId]: error?.message ?? "즐겨찾기를 저장하지 못했습니다.",
                },
            }));
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    fetchBlocks: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        set({ blocksStatus: "loading", blocksError: null });
        try {
            const blocks = await fetchBlockedUsers();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (!get().claimSeq("blocks", ticket, { ok: true })) return get().supersededResult("blocks");
            set({ blockedUsers: Array.isArray(blocks) ? blocks : [], blocksStatus: "success", blocksError: null });
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            const message = error?.message ?? "차단 목록을 불러오지 못했습니다.";
            if (!get().claimSeq("blocks", ticket, { ok: false, message })) return get().supersededResult("blocks");
            set({ blocksStatus: "error", blocksError: message });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    blockUser: async (targetId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        try {
            await blockUserApi(targetId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            await Promise.all([get().fetchFriends(), get().fetchIncomingRequests(), get().fetchBlocks()]);
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            return { ok: false, reason: "error", message: error?.message ?? "차단하지 못했습니다." };
        }
    },

    unblockUser: async (targetId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        try {
            await unblockUserApi(targetId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            await Promise.all([get().fetchFriends(), get().fetchBlocks()]);
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            return { ok: false, reason: "error", message: error?.message ?? "차단을 해제하지 못했습니다." };
        }
    },

    removeIncomingRequest: (requestId) => {
        const ticket = nextSeq();
        set((state) => ({
            incomingRemovals: { ...state.incomingRemovals, [requestId]: ticket },
            incomingRequests: state.incomingRequests.filter((request) => request.request_id !== requestId),
        }));
    },

    setIncomingRequests: (requests) => {
        const ticket = get().bumpSeq("incoming");
        set((state) => {
            const pending = {};
            for (const [id, seq] of Object.entries(state.incomingRemovals)) {
                if (seq > ticket) pending[id] = seq;
            }
            return { incomingRequests: requests, incomingRemovals: pending };
        });
    },

    lockRequests: (ids, owner = undefined) => {
        get().syncAccount();
        const state = get();
        const fresh = ids.filter((id) => !state.processingRequestIds.has(id));
        if (fresh.length === 0) return [];
        const next = new Set(state.processingRequestIds);
        for (const id of fresh) next.add(id);
        if (owner === undefined) {
            set({ processingRequestIds: next });
            return fresh;
        }
        const owners = { ...state.requestLockOwners };
        for (const id of fresh) owners[id] = owner;
        set({ processingRequestIds: next, requestLockOwners: owners });
        return fresh;
    },

    beginOperation: () => nextOperationId(),

    unlockRequests: (ids, owner = undefined) => set((state) => {
        const next = new Set(state.processingRequestIds);
        const owners = { ...state.requestLockOwners };
        for (const id of ids) {
            if (owner !== undefined && owners[id] !== owner) continue;
            next.delete(id);
            delete owners[id];
        }
        return { processingRequestIds: next, requestLockOwners: owners };
    }),

    setAcceptAllResult: (result) => set({ acceptAllResult: result }),

    addSentRequest: (uuid) => set((state) => ({
        sentRequestIds: new Set(state.sentRequestIds).add(uuid),
    })),

    removeSentRequest: (uuid) => set((state) => {
        const nextSent = new Set(state.sentRequestIds);
        nextSent.delete(uuid);

        const nextResolved = new Set(state.resolvedRequestIds).add(uuid);

        return { sentRequestIds: nextSent, resolvedRequestIds: nextResolved };
    }),

    clearResolvedRequests: () => set({ resolvedRequestIds: new Set() }),

    updateFriendStatus: (uuid, status) => set((state) => ({
        friends: state.friends.map((friend) =>
            friend.id === uuid
                ? { ...friend, status, online: status !== "OFFLINE" }
                : friend
        ),
    })),

    reset: () => set(initialAccountState()),

    __resetForTests: () => set(initialState()),
}));
