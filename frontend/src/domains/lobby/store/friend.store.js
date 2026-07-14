import { create } from "zustand";
import {
    fetchIncomingRequests as fetchIncomingRequestsApi,
    fetchMyFriends,
} from "@/domains/lobby/api/friend.api";

// 로비 친구 목록과 친구 요청 상태를 전역에서 관리하는 store입니다.
export const useFriendStore = create((set) => ({
    // 내 친구 목록입니다.
    friends: [],

    // 나에게 들어온 친구 요청 목록입니다.
    incomingRequests: [],

    // 내가 이미 친구 요청을 보낸 사용자 id 목록입니다.
    // Set을 쓰면 "이미 보냈는지"를 빠르게 확인할 수 있습니다.
    sentRequestIds: new Set(),

    // 요청을 수락/거절해서 화면에서 처리 완료된 요청 id 목록입니다.
    resolvedRequestIds: new Set(),

    // 서버에서 내 친구 목록을 가져와 store에 저장합니다.
    fetchFriends: async () => {
        try {
            const friendsData = await fetchMyFriends();
            set({ friends: friendsData });
        } catch (error) {
            console.error("친구 목록 불러오기 실패", error);
        }
    },

    // 서버에서 나에게 들어온 친구 요청 목록을 가져와 store에 저장합니다.
    fetchIncomingRequests: async () => {
        try {
            const requests = await fetchIncomingRequestsApi();
            set({ incomingRequests: requests });
        } catch (error) {
            console.error("받은 친구 신청 불러오기 실패", error);
        }
    },

    // 수락/거절한 친구 요청을 받은 요청 목록에서 제거합니다.
    removeIncomingRequest: (requestId) => set((state) => ({
        incomingRequests: state.incomingRequests.filter((request) => request.request_id !== requestId),
    })),

    // 소켓 이벤트나 API 응답으로 받은 요청 목록을 통째로 교체합니다.
    setIncomingRequests: (requests) => set({ incomingRequests: requests }),

    // 특정 사용자에게 친구 요청을 보냈다고 표시합니다.
    addSentRequest: (uuid) => set((state) => ({
        // Zustand가 변경을 감지할 수 있게 기존 Set을 직접 수정하지 않고 새 Set을 만듭니다.
        sentRequestIds: new Set(state.sentRequestIds).add(uuid),
    })),

    // 친구 요청이 처리된 사용자 id를 보낸 요청 목록에서 제거하고 처리 완료 목록에 넣습니다.
    removeSentRequest: (uuid) => set((state) => {
        const nextSent = new Set(state.sentRequestIds);
        nextSent.delete(uuid);

        const nextResolved = new Set(state.resolvedRequestIds).add(uuid);

        return { sentRequestIds: nextSent, resolvedRequestIds: nextResolved };
    }),

    // 처리 완료 표시를 초기화합니다.
    clearResolvedRequests: () => set({ resolvedRequestIds: new Set() }),

    // 소켓으로 친구 접속 상태가 바뀌었을 때 친구 목록 안의 상태를 갱신합니다.
    updateFriendStatus: (uuid, status) => set((state) => ({
        friends: state.friends.map((friend) =>
            friend.id === uuid
                ? { ...friend, status, online: status !== "OFFLINE" }
                : friend
        ),
    })),
}));
