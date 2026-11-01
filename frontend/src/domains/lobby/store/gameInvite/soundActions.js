// 게임 초대 소리 한 번만 내기 액션 (소비 표시·이유 설명)
// gameInvite.store.js가 create 안에서 펼쳐 씀
import { evalSound } from "../../utils/gameInvite/inviteSound.js";

export const soundActions = (set, get) => ({
    // 소리 낼 수 있으면 소비로 표시하고 true, 같은 초대로 두 번 안 울리게 함
    consumeInviteSound: (accountId, invite, now = Date.now()) => {
        get().syncAccount();
        const state = get();
        if (!evalSound(state, accountId, invite, now).eligible) return false;

        const soundConsumed = new Set(state.soundConsumed);
        soundConsumed.add(invite.inviteId);
        set({ soundConsumed });
        return true;
    },

    // 진단 기록용: 소리 낼지와 막힌 이유만 알려 줌 (소비 표시 안 함)
    explainInviteSound: (accountId, invite, now = Date.now()) => (
        evalSound(get(), accountId, invite, now)
    ),
});
