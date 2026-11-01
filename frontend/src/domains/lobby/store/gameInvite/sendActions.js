// 게임 초대 보내기 액션 (중복 막기·멱등 키·오류 기록)
// gameInvite.store.js가 create 안에서 펼쳐 씀
import { createGameInviteApi } from "../../api/friend.api.js";
import { isTerminalRefusal } from "../../utils/gameInvite/invites.js";

export const sendActions = (set, get) => ({
    // 같은 키로 다시 보내면 서버가 같은 초대로 봄, 확정 응답을 받아야 키를 넘김
    sendInvite: async (receiverId, keyScope) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        if (get().sendingReceiverIds.has(receiverId)) return { ok: false, reason: "in-progress" };

        // 키 묶음을 안 주면 받는 사람 id로 묶음
        const scope = typeof keyScope === "string" && keyScope.length > 0 ? keyScope : receiverId;
        const attempt = get().sendKeys[scope] ?? 1;
        const creationKey = `${scope}:${get().sendLifecycleId}:${attempt}`;

        // 보내는 중 표시, 그 사람 옛 오류 지움
        set((state) => ({
            sendingReceiverIds: new Set(state.sendingReceiverIds).add(receiverId),
            sendErrors: Object.fromEntries(
                Object.entries(state.sendErrors).filter(([id]) => id !== receiverId),
            ),
        }));
        const clearSending = () => set((state) => {
            const next = new Set(state.sendingReceiverIds);
            next.delete(receiverId);
            return { sendingReceiverIds: next };
        });
        // 그사이 다른 시도가 키를 넘겼으면 건드리지 않음
        const advanceKey = () => set((state) => (
            (state.sendKeys[scope] ?? 1) !== attempt
                ? {}
                : { sendKeys: { ...state.sendKeys, [scope]: attempt + 1 } }
        ));

        try {
            const invite = await createGameInviteApi(receiverId, creationKey);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearSending();
            advanceKey();
            return { ok: true, invite, creationKey };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearSending();
            // 확정 거절이면 다음엔 새 키, 아니면 같은 키로 다시 보내게 둠
            if (isTerminalRefusal(error?.status)) advanceKey();
            set((state) => ({
                sendErrors: { ...state.sendErrors, [receiverId]: error?.message ?? "초대를 보내지 못했습니다." },
            }));
            return { ok: false, reason: "error", message: error?.message, creationKey };
        }
    },
});
