// 친구·받은 신청·즐겨찾기·차단 목록 불러오기와 친구 접속 상태 반영 액션
// friend.store.js가 create 안에서 펼쳐 씀
import {
    fetchBlockedUsers,
    fetchFavoriteFriendIds,
    fetchIncomingRequests as fetchIncomingApi,
    fetchMyFriends,
} from "../../api/friend.api.js";
import { applyFavoriteWrites, newerRemovals } from "../../utils/friend/pendingWrites.js";
import { nextSeq } from "./state.js";

// 네 목록 모두 같은 틀: 로그인 확인 → 번호표 → 응답 뒤 계정·순번 확인 → 반영, 실패도 같은 확인 뒤 오류 남김
export const loadActions = (set, get) => ({
    // 친구 목록: 계정이 바뀌었거나 더 새 응답이 이미 반영됐으면 버림
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

    // 받은 신청: 응답 뒤에 지운 신청은 다시 안 보이게 걸러냄
    fetchIncomingRequests: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        try {
            const requests = await fetchIncomingApi();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (!get().claimSeq("incoming", ticket, { ok: true })) return get().supersededResult("incoming");
            set((state) => {
                const pending = newerRemovals(state.incomingRemovals, ticket);
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

    // 즐겨찾기: 응답 뒤에 저장한 변경은 응답 위에 다시 얹음
    fetchFavorites: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        const ticket = nextSeq();
        try {
            const ids = await fetchFavoriteFriendIds();
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (!get().claimSeq("favorites", ticket, { ok: true })) return get().supersededResult("favorites");
            set((state) => {
                const { next, pending } = applyFavoriteWrites(ids, state.favoriteWrites, ticket);
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

    // 차단 목록: 불러오는 동안 loading 상태를 보여 줌
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

    // 소켓으로 온 친구 접속 상태를 목록에 반영함 (OFFLINE 말고는 접속으로 봄)
    updateFriendStatus: (uuid, status) => set((state) => ({
        friends: state.friends.map((friend) =>
            friend.id === uuid
                ? { ...friend, status, online: status !== "OFFLINE" }
                : friend
        ),
    })),
});
