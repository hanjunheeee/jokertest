// 받은 신청 목록 바꾸기·보낸 신청 표시·보낸 신청 취소 액션
// friend.store.js가 create 안에서 펼쳐 씀
import { cancelFriendRequest } from "../../api/friend.api.js";
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

    // 받은 신청 목록을 통째로 바꿈, 그 뒤에 지운 신청 기록만 남김 (지금 아무도 안 씀)
    setIncomingRequests: (requests) => {
        const ticket = get().bumpSeq("incoming");
        set((state) => {
            const pending = newerRemovals(state.incomingRemovals, ticket);
            return { incomingRequests: requests, incomingRemovals: pending };
        });
    },

    // 검색 결과 줄을 보낸 신청으로 표시
    addSentRequest: (uuid) => set((state) => ({
        sentRequestIds: new Set(state.sentRequestIds).add(uuid),
    })),

    // 상대가 응답한 신청은 보낸 목록에서 빼고 응답 끝난 목록에 넣음
    removeSentRequest: (uuid) => {
        // 보낸 신청 줄도 같이 지움, 먼저 떠난 목록 응답이 그 줄을 되살리지 못하게 순번을 올림 (그 응답은 버려지므로 받는 중 표시도 여기서 끝냄)
        if (get().outgoingRequests.some((request) => request.id === uuid)) {
            get().bumpSeq("outgoing");
            set({ outgoingStatus: "success" });
        }
        set((state) => {
            const nextSent = new Set(state.sentRequestIds);
            nextSent.delete(uuid);

            const nextResolved = new Set(state.resolvedRequestIds).add(uuid);

            return {
                sentRequestIds: nextSent,
                resolvedRequestIds: nextResolved,
                outgoingRequests: state.outgoingRequests.filter((request) => request.id !== uuid),
            };
        });
    },

    // 보낸 신청 취소: 성공하면 그 줄과 "신청 완료" 표시를 지움 (다시 신청할 수 있게), 실패하면 줄에 문구 남기고 목록 다시 받음
    cancelSentRequest: async (requestId) => {
        const generation = get().syncAccount();
        if (get().accountId === null) return { ok: false, reason: "anonymous" };
        // 취소 중인 신청은 다시 안 보냄 (연타 막기)
        if (get().cancelPendingIds.has(requestId)) return { ok: false, reason: "busy" };

        set((state) => ({
            cancelPendingIds: new Set(state.cancelPendingIds).add(requestId),
            cancelErrors: Object.fromEntries(
                Object.entries(state.cancelErrors).filter(([id]) => id !== String(requestId)),
            ),
        }));
        const clearPending = () => set((state) => {
            const next = new Set(state.cancelPendingIds);
            next.delete(requestId);
            return { cancelPendingIds: next };
        });

        try {
            await cancelFriendRequest(requestId);
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            // 먼저 떠난 목록 응답이 취소한 줄을 되살리지 못하게 순번을 올림
            get().bumpSeq("outgoing");
            set((state) => {
                const row = state.outgoingRequests.find((request) => request.request_id === requestId);
                const nextSent = new Set(state.sentRequestIds);
                if (row) nextSent.delete(row.id);
                return {
                    sentRequestIds: nextSent,
                    outgoingRequests: state.outgoingRequests.filter((request) => request.request_id !== requestId),
                    // 먼저 떠난 목록 응답은 버려지므로 받는 중 표시도 여기서 끝냄
                    outgoingStatus: "success",
                };
            });
            return { ok: true };
        } catch (error) {
            if (!get().isCurrent(generation)) return { ok: false, reason: "stale" };
            clearPending();
            // 콘솔만 찍으면 눌러도 반응 없는 것처럼 보여 줄에 문구 남김 (수락·거절 실패와 같은 말투)
            set((state) => ({
                cancelErrors: { ...state.cancelErrors, [requestId]: "취소하지 못했습니다. 다시 시도해 주세요." },
            }));
            // 그사이 상대가 답했으면 목록이 실제와 달라 다시 받음 (그 줄이 사라짐)
            await get().fetchOutgoingRequests();
            return { ok: false, reason: "error", message: error?.message };
        }
    },

    // 새 검색 때 응답 끝난 신청 기록 비움
    clearResolvedRequests: () => set({ resolvedRequestIds: new Set() }),
});
