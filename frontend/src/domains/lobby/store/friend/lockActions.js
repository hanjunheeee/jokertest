// 받은 신청 처리 잠금·작업 번호·전체 수락 결과 액션
// friend.store.js가 create 안에서 펼쳐 씀
import { nextOperationId } from "./state.js";

export const lockActions = (set, get) => ({
    // 아직 안 잠긴 신청만 잠그고 그 목록을 돌려줌, 주인을 주면 함께 남김
    lockRequests: (ids, owner = undefined) => {
        get().syncAccount();
        const state = get();
        const fresh = ids.filter((id) => !state.processingRequestIds.has(id));
        if (fresh.length === 0) return [];
        const next = new Set(state.processingRequestIds);
        for (const id of fresh) next.add(id);
        if (owner === undefined) {
            set({ processingRequestIds: next });
            return fresh;
        }
        const owners = { ...state.requestLockOwners };
        for (const id of fresh) owners[id] = owner;
        set({ processingRequestIds: next, requestLockOwners: owners });
        return fresh;
    },

    // 받은 신청 처리 작업 번호 새로 받기 (잠금 주인으로 씀)
    beginOperation: () => nextOperationId(),

    // 주인을 주면 그 주인이 잠근 신청만 풂
    unlockRequests: (ids, owner = undefined) => set((state) => {
        const next = new Set(state.processingRequestIds);
        const owners = { ...state.requestLockOwners };
        for (const id of ids) {
            if (owner !== undefined && owners[id] !== owner) continue;
            next.delete(id);
            delete owners[id];
        }
        return { processingRequestIds: next, requestLockOwners: owners };
    }),

    // 전부 수락 진행·결과 저장 (받은 신청 탭 안내 줄이 읽음)
    setAcceptAllResult: (result) => set({ acceptAllResult: result }),
});
