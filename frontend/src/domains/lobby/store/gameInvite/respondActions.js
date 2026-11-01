// 받은 게임 초대 거절·수락 잠금·초대별 오류 액션
// gameInvite.store.js가 create 안에서 펼쳐 씀
import { declineGameInviteApi } from "../../api/friend.api.js";
import { isUsable, merge } from "../../utils/gameInvite/invites.js";
import { nextOperationId } from "./state.js";

export const respondActions = (set, get) => ({
    // 거절 요청: 같은 초대 중복 처리 막고, 끝나면 서버가 준 줄로 덮음
    declineInvite: async (inviteId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        if (get().pendingInviteIds.has(inviteId)) return { ok: false, reason: "in-progress" };

        set((state) => ({
            pendingInviteIds: new Set(state.pendingInviteIds).add(inviteId),
            inviteErrors: Object.fromEntries(
                Object.entries(state.inviteErrors).filter(([id]) => id !== inviteId),
            ),
        }));
        const clearPending = () => set((state) => {
            const next = new Set(state.pendingInviteIds);
            next.delete(inviteId);
            return { pendingInviteIds: next };
        });

        try {
            const invite = await declineGameInviteApi(inviteId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            if (isUsable(invite)) {
                set((state) => ({ invites: merge(state.invites, [invite]) }));
            }
            return { ok: true, invite };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            set((state) => ({
                inviteErrors: { ...state.inviteErrors, [inviteId]: error?.message ?? "초대를 거절하지 못했습니다." },
            }));
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    beginAcceptOperation: () => nextOperationId(),

    // 수락 잠금: 잠글 때 주인을 남기고, 풀 때는 같은 주인만 풂
    markAcceptPending: (inviteId, pending, owner = undefined) => set((state) => {
        if (pending) {
            const next = new Set(state.pendingInviteIds).add(inviteId);
            return owner === undefined
                ? { pendingInviteIds: next }
                : { pendingInviteIds: next, acceptOwners: { ...state.acceptOwners, [inviteId]: owner } };
        }
        if (owner !== undefined && state.acceptOwners[inviteId] !== owner) return {};
        const next = new Set(state.pendingInviteIds);
        next.delete(inviteId);
        return {
            pendingInviteIds: next,
            acceptOwners: Object.fromEntries(
                Object.entries(state.acceptOwners).filter(([id]) => id !== inviteId),
            ),
        };
    }),

    // null이면 그 초대 오류를 지움
    setInviteError: (inviteId, message) => set((state) => ({
        inviteErrors: message === null
            ? Object.fromEntries(Object.entries(state.inviteErrors).filter(([id]) => id !== inviteId))
            : { ...state.inviteErrors, [inviteId]: message },
    })),
});
