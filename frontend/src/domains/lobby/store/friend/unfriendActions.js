// 친구 끊기 액션 (끊는 중 표시·실패 문구·목록에서 지우기)
// friend.store.js가 create 안에서 펼쳐 씀
import { unfriendApi } from "../../api/friend.api.js";

export const unfriendActions = (set, get) => ({
    // 친구 끊기: 성공하면 그 줄을 바로 지우고 친구·즐겨찾기 목록을 다시 받음, 실패하면 줄에 문구 남김
    unfriend: async (friendId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        // 끊는 중인 친구는 다시 안 보냄 (연타 막기)
        if (get().unfriendPendingIds.has(friendId)) return { ok: false, reason: "busy" };

        set((state) => ({
            unfriendPendingIds: new Set(state.unfriendPendingIds).add(friendId),
            unfriendErrors: Object.fromEntries(
                Object.entries(state.unfriendErrors).filter(([id]) => id !== friendId),
            ),
        }));
        const clearPending = () => set((state) => {
            const next = new Set(state.unfriendPendingIds);
            next.delete(friendId);
            return { unfriendPendingIds: next };
        });

        try {
            await unfriendApi(friendId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            // 다시 받기가 실패해도 끊은 친구가 남아 보이지 않게 먼저 지움 (즐겨찾기 표시도)
            set((state) => {
                const nextFavorites = new Set(state.favoriteFriendIds);
                nextFavorites.delete(friendId);
                return {
                    friends: state.friends.filter((friend) => friend.id !== friendId),
                    favoriteFriendIds: nextFavorites,
                };
            });
            await Promise.all([get().fetchFriends(), get().fetchFavorites()]);
            clearPending();
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            set((state) => ({
                unfriendErrors: {
                    ...state.unfriendErrors,
                    [friendId]: error?.message ?? "친구를 끊지 못했습니다.",
                },
            }));
            // 이미 친구가 아니었으면 목록이 실제와 달라 다시 받음 (그 줄이 사라짐)
            await get().fetchFriends();
            clearPending();
            return { ok: false, reason: "error", message: error?.message };
        }
    },
});
