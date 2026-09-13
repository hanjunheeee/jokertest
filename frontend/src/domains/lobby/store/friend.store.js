import { create } from "zustand";
// node --test는 @/ alias를 풀지 못하므로 단위 테스트가 닿는 경계는 상대 경로로 둡니다.
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

/**
 * 현재 로그인 계정. 로그인 boolean만 남아 있고 uuid가 없으면 계정이 없는 것으로 봅니다.
 * (notifications.store.js의 readAuthAccountId와 같은 판정입니다.)
 */
function readAuthAccountId() {
    const auth = useAuthStore.getState();
    return auth.isLoggedIn && typeof auth.user?.uuid === "string" && auth.user.uuid.length > 0
        ? auth.user.uuid
        : null;
}

/** 계정이 바뀔 때 통째로 버리는 값들. 계정에 묶이지 않은 값은 여기 두지 않습니다. */
const initialAccountState = () => ({
    // 내 친구 목록입니다.
    friends: [],

    // 나에게 들어온 친구 요청 목록입니다.
    incomingRequests: [],

    // 내가 이미 친구 요청을 보낸 사용자 id 목록입니다.
    // Set을 쓰면 "이미 보냈는지"를 빠르게 확인할 수 있습니다.
    sentRequestIds: new Set(),

    // 요청을 수락/거절해서 화면에서 처리 완료된 요청 id 목록입니다.
    resolvedRequestIds: new Set(),

    // F-19(AC-03): 서버가 소유한 계정별 즐겨찾기입니다. 로그아웃·계정 전환 시 여기서
    // 통째로 비워지므로 이전 계정의 별 표시가 다음 계정 화면에 남지 않습니다.
    favoriteFriendIds: new Set(),

    // 즐겨찾기 저장이 진행 중인 친구 id들. 서버가 확정하기 전에는 별 상태를 바꾸지 않습니다.
    favoritePendingIds: new Set(),

    // 즐겨찾기 저장 실패(friendId → 메시지). 실패를 성공으로 위장하지 않습니다.
    favoriteErrors: {},

    // F-19(AC-04): 내가 차단한 사용자 목록입니다.
    blockedUsers: [],
    blocksStatus: "idle", // idle | loading | success | error
    blocksError: null,

    // 조회 실패는 삼키지 않고 화면이 재시도를 제공할 수 있게 남깁니다(AC-02).
    friendsError: null,
    incomingError: null,
    favoritesError: null,
});

const initialState = () => ({
    accountId: null,
    accountGeneration: 0,
    ...initialAccountState(),
});

// 로비 친구 목록과 친구 요청 상태를 전역에서 관리하는 store입니다.
export const useFriendStore = create((set, get) => ({
    ...initialState(),

    /**
     * 인증 계정을 현재 값으로 맞춥니다(A-02).
     *
     * 계정이 조금이라도 달라지면(로그아웃 · A→B 직접 전환 모두) 친구·요청·보낸/처리된 요청·
     * 즐겨찾기·차단을 **전부** 버리고 세대를 올립니다. 진행 중이던 조회·저장은 완료 지점에서
     * 세대를 비교해 스스로 무효가 됩니다 — A의 지연 응답이 B의 화면에 반영되지 않습니다.
     */
    syncAccount: () => {
        const next = readAuthAccountId();
        const state = get();
        if (state.accountId === next) return state.accountGeneration;

        const accountGeneration = state.accountGeneration + 1;
        set({ accountId: next, accountGeneration, ...initialAccountState() });
        return accountGeneration;
    },

    /** 이 비동기 결과가 아직 유효한가(계정이 그대로인가). */
    isCurrent: (accountGeneration) => get().accountGeneration === accountGeneration,

    // 서버에서 내 친구 목록을 가져와 store에 저장합니다.
    // 오류를 삼키지 않고 명시적인 성공/실패를 돌려줍니다 — 호출부(전체 수락 등)가
    // "재조회까지 성공했는가"를 구분해 안내해야 하기 때문입니다(AC-02).
    fetchFriends: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        try {
            const friendsData = await fetchMyFriends();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set({ friends: friendsData, friendsError: null });
            return { ok: true, friends: friendsData };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set({ friendsError: error?.message ?? "친구 목록을 불러오지 못했습니다." });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    // 서버에서 나에게 들어온 친구 요청 목록을 가져와 store에 저장합니다.
    fetchIncomingRequests: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        try {
            const requests = await fetchIncomingRequestsApi();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set({ incomingRequests: requests, incomingError: null });
            return { ok: true, requests };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set({ incomingError: error?.message ?? "받은 친구 신청을 불러오지 못했습니다." });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    // F-19(AC-03): 서버에 저장된 즐겨찾기를 복원합니다.
    fetchFavorites: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        try {
            const ids = await fetchFavoriteFriendIds();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set({ favoriteFriendIds: new Set(Array.isArray(ids) ? ids : []), favoritesError: null });
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set({ favoritesError: error?.message ?? "즐겨찾기를 불러오지 못했습니다." });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    /**
     * 즐겨찾기를 서버에 저장합니다(AC-03).
     *
     * **원하는 값을 그대로 보냅니다** — toggle 명령이 아니라서 응답 유실 후 재전송이 상태를
     * 뒤집지 않습니다. 서버가 확정하기 전에는 별 상태를 바꾸지 않고, 실패하면 오류만 남기고
     * 이전 값을 유지합니다(저장 완료로 위장하지 않습니다).
     */
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
            // 서버가 확정한 값만 반영합니다(요청한 값이 아니라).
            const confirmed = result?.favorite === true;
            set((state) => {
                const next = new Set(state.favoriteFriendIds);
                if (confirmed) next.add(friendId); else next.delete(friendId);
                return { favoriteFriendIds: next };
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

    // F-19(AC-04): 차단 목록·차단·해제.
    fetchBlocks: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        set({ blocksStatus: "loading", blocksError: null });
        try {
            const blocks = await fetchBlockedUsers();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set({ blockedUsers: Array.isArray(blocks) ? blocks : [], blocksStatus: "success", blocksError: null });
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set({ blocksStatus: "error", blocksError: error?.message ?? "차단 목록을 불러오지 못했습니다." });
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    blockUser: async (targetId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        try {
            await blockUserApi(targetId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            // 차단은 친구 목록·받은 요청·차단 목록을 모두 바꾼다 — 서버에서 다시 읽는다.
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
            // 해제는 친구 관계를 되살리지만(목록에 다시 보인다) 과거 요청·초대를 되살리지는
            // 않는다 — 그 판정은 전부 서버가 하고 여기서는 다시 읽기만 한다.
            await Promise.all([get().fetchFriends(), get().fetchBlocks()]);
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            return { ok: false, reason: "error", message: error?.message ?? "차단을 해제하지 못했습니다." };
        }
    },

    // 수락/거절한 친구 요청을 받은 요청 목록에서 제거합니다.
    removeIncomingRequest: (requestId) => set((state) => ({
        incomingRequests: state.incomingRequests.filter((request) => request.request_id !== requestId),
    })),

    // 소켓 이벤트나 API 응답으로 받은 요청 목록을 통째로 교체합니다.
    setIncomingRequests: (requests) => set({ incomingRequests: requests }),

    // 특정 사용자에게 친구 요청을 보냈다고 표시합니다.
    addSentRequest: (uuid) => set((state) => ({
        // Zustand가 변경을 감지할 수 있게 기존 Set을 직접 수정하지 않고 새 Set을 만듭니다.
        sentRequestIds: new Set(state.sentRequestIds).add(uuid),
    })),

    // 친구 요청이 처리된 사용자 id를 보낸 요청 목록에서 제거하고 처리 완료 목록에 넣습니다.
    removeSentRequest: (uuid) => set((state) => {
        const nextSent = new Set(state.sentRequestIds);
        nextSent.delete(uuid);

        const nextResolved = new Set(state.resolvedRequestIds).add(uuid);

        return { sentRequestIds: nextSent, resolvedRequestIds: nextResolved };
    }),

    // 처리 완료 표시를 초기화합니다.
    clearResolvedRequests: () => set({ resolvedRequestIds: new Set() }),

    // 소켓으로 친구 접속 상태가 바뀌었을 때 친구 목록 안의 상태를 갱신합니다.
    updateFriendStatus: (uuid, status) => set((state) => ({
        friends: state.friends.map((friend) =>
            friend.id === uuid
                ? { ...friend, status, online: status !== "OFFLINE" }
                : friend
        ),
    })),

    reset: () => set(initialAccountState()),

    /** 시험 전용 — 계정 정보까지 포함해 완전히 초기화합니다. */
    __resetForTests: () => set(initialState()),
}));
