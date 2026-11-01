// 게임 초대 스냅샷 불러오기·실시간 초대 받기 액션
// gameInvite.store.js가 create 안에서 펼쳐 씀
import { fetchGameInviteSnapshot } from "../../api/friend.api.js";
import { isActionable, isUsable, merge } from "../../utils/gameInvite/invites.js";
import { mergeSnapshot } from "../../utils/gameInvite/mergeSnapshot.js";
import { nextSnapshotSeq } from "./state.js";

export const snapshotActions = (set, get) => ({
    // 서버 스냅샷을 받아 합침, 늦게 온 옛 응답은 버림
    loadSnapshot: async () => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };

        const ticket = nextSnapshotSeq();
        // 불러오는 중 표시, 복원 중으로 둬서 새 초대 소리를 미룸
        set({ status: "loading", error: null, restorePending: true });

        let data;
        try {
            data = await fetchGameInviteSnapshot();
        } catch (error) {
            // 계정이 바뀌었거나 더 새 스냅샷이 이미 들어왔으면 오류를 안 남김
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            if (get().snapshotSeq >= ticket) return { ok: false, reason: "superseded", superseded: true };
            set({ status: "error", error: error?.message ?? "초대를 불러오지 못했습니다." });
            return { ok: false, reason: "error" };
        }

        // 계정이 바뀌었으면 버림 (옛 스냅샷인지는 mergeSnapshot이 커서로 봄)
        if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };

        const { patch, result } = mergeSnapshot(get(), data, ticket);
        set(patch);
        return result;
    },

    // 소켓으로 온 초대: 스냅샷 전이면 버퍼에 두고, 복원 중이면 소리만 미룸
    receiveLiveInvite: (accountId, invite, sfxEvent = null) => {
        const state = get();
        // 다른 계정·못 쓰는 줄·내가 받는 초대 아님이면 안 받음
        if (accountId === null || accountId !== state.accountId) return { applied: false, reason: "account-mismatch" };
        if (!isUsable(invite)) return { applied: false, reason: "invalid" };
        if (invite.receiverId !== accountId) return { applied: false, reason: "receiver-mismatch" };

        // 스냅샷 전이면 버퍼에 모음
        if (!state.snapshotLoaded) {
            set({ liveBuffer: [...state.liveBuffer, { invite, sfxEvent }] });
            return { applied: false, reason: "buffered" };
        }

        // 스냅샷이 이미 끝난 걸로 본 대기 초대면 버림
        if (!isActionable(invite, state.snapshotPendingIds, state.cursor, state.snapshotLoaded)) {
            return { applied: false, reason: "known-terminal" };
        }

        const invites = merge(state.invites, [invite]);

        // 복원 중에 온 새 초대는 목록엔 넣고 소리는 스냅샷 뒤로 미룸
        if (state.restorePending
            && sfxEvent !== null && sfxEvent !== undefined
            && !state.soundConsumed.has(invite.inviteId)) {
            set({ invites, liveBuffer: [...state.liveBuffer, { invite, sfxEvent }] });
            return { applied: true, deferredSound: true };
        }

        set({ invites });
        return { applied: true };
    },
});
