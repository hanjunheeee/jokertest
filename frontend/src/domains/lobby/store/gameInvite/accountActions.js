// 게임 초대 스토어의 계정 맞추기·재동기화 시작·초기화 액션
// gameInvite.store.js가 create 안에서 펼쳐 씀
import { readAccountId } from "../accountId.js";
import { initialAccountState, initialState } from "./state.js";

export const accountActions = (set, get) => ({
    // 로그인 계정이 바뀌었으면 세대를 올리고 계정별 상태를 비움, 지금 세대를 돌려줌
    syncAccount: () => {
        const next = readAccountId();
        const state = get();
        if (state.accountId === next) return state.accountGeneration;
        const accountGeneration = state.accountGeneration + 1;
        set({ accountId: next, accountGeneration, ...initialAccountState() });
        return accountGeneration;
    },

    // 비동기 작업이 시작한 세대가 아직 지금 세대인지
    isCurrent: (accountGeneration) => get().accountGeneration === accountGeneration,

    // 재접속 때 스냅샷 다시 받기 전까지 실시간 초대를 버퍼에 모음
    beginResync: () => set({ snapshotLoaded: false, restorePending: true, liveBuffer: [] }),

    reset: () => set(initialAccountState()),
    __resetForTests: () => set(initialState()),
});
