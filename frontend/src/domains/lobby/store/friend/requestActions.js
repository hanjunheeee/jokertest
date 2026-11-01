// 받은 신청 목록 바꾸기·보낸 신청 표시 액션
// friend.store.js가 create 안에서 펼쳐 씀
import { newerRemovals } from "../../utils/friend/pendingWrites.js";
import { nextSeq } from "./state.js";

export const requestActions = (set, get) => ({
    // 처리한 신청을 바로 지우고 번호표를 남겨 늦은 목록 응답이 되살리지 못하게 함
    removeIncomingRequest: (requestId) => {
        const ticket = nextSeq();
        set((state) => ({
            incomingRemovals: { ...state.incomingRemovals, [requestId]: ticket },
            incomingRequests: state.incomingRequests.filter((request) => request.request_id !== requestId),
        }));
    },

    // 받은 신청 목록을 통째로 바꿈, 그 뒤에 지운 신청 기록만 남김
    setIncomingRequests: (requests) => {
        const ticket = get().bumpSeq("incoming");
        set((state) => {
            const pending = newerRemovals(state.incomingRemovals, ticket);
            return { incomingRequests: requests, incomingRemovals: pending };
        });
    },

    addSentRequest: (uuid) => set((state) => ({
        sentRequestIds: new Set(state.sentRequestIds).add(uuid),
    })),

    // 상대가 응답한 신청은 보낸 목록에서 빼고 응답 끝난 목록에 넣음
    removeSentRequest: (uuid) => set((state) => {
        const nextSent = new Set(state.sentRequestIds);
        nextSent.delete(uuid);

        const nextResolved = new Set(state.resolvedRequestIds).add(uuid);

        return { sentRequestIds: nextSent, resolvedRequestIds: nextResolved };
    }),

    clearResolvedRequests: () => set({ resolvedRequestIds: new Set() }),
});
