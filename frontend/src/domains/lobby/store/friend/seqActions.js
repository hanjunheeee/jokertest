// 친구 스토어의 계정 맞추기와 목록별 응답 순번 장부 액션
// friend.store.js가 create 안에서 펼쳐 씀
import { readAccountId } from "../accountId.js";
import { initialAccountState, initialState, nextSeq } from "./state.js";

export const seqActions = (set, get) => ({
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

    // 이 번호표가 그 목록의 마지막 반영보다 새로울 때만 반영 권한을 줌
    claimSeq: (key, ticket, outcome = { ok: true }) => {
        if (get().appliedSeq[key] >= ticket) return false;
        set((state) => ({
            appliedSeq: { ...state.appliedSeq, [key]: ticket },
            appliedResult: { ...state.appliedResult, [key]: outcome },
        }));
        return true;
    },

    // 더 새 응답에 밀렸을 때 그 응답의 결과를 대신 돌려줌
    supersededResult: (key) => {
        const applied = get().appliedResult[key];
        if (applied === null || applied === undefined) {
            return { ok: false, reason: "superseded-unknown", superseded: true };
        }
        return applied.ok
            ? { ok: true, superseded: true }
            : { ok: false, reason: "superseded-error", superseded: true, message: applied.message };
    },

    // 로컬에서 목록을 직접 바꿀 때 그보다 먼저 시작한 응답이 덮지 못하게 순번을 올림
    bumpSeq: (key) => {
        const ticket = nextSeq();
        set((state) => ({
            appliedSeq: { ...state.appliedSeq, [key]: ticket },
            appliedResult: { ...state.appliedResult, [key]: { ok: true } },
        }));
        return ticket;
    },

    reset: () => set(initialAccountState()),

    __resetForTests: () => set(initialState()),
});
