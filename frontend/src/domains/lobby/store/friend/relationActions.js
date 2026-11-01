// 즐겨찾기 저장·차단·차단 해제 액션
// friend.store.js가 create 안에서 펼쳐 씀
import { blockUserApi, setFriendFavoriteApi, unblockUserApi } from "../../api/friend.api.js";
import { nextSeq } from "./state.js";

export const relationActions = (set, get) => ({
    // 즐겨찾기 저장: 서버가 확정한 값으로 반영하고 번호표를 남겨 늦은 목록 응답이 못 덮게 함
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

    // 차단 뒤엔 친구·받은 신청·차단 목록을 함께 다시 받음
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

    // 차단 해제 뒤엔 친구·차단 목록을 다시 받음
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
});
