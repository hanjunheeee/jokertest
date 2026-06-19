/**
 * @file friendStore.js
 * @desc 친구 목록 · 받은 신청 목록 · 보낸 신청 ID 상태 스토어.
 *
 * incomingRequests / sentRequestIds를 스토어에 두는 이유:
 *   useSocket은 App.jsx 최상단에서 동작하므로 하위 훅의 로컬 state에 접근할 수 없습니다.
 *   소켓 이벤트 → 스토어 액션 → 구독 컴포넌트 리렌더 경로로 실시간 반영합니다.
 */

import { create } from 'zustand';
import { fetchMyFriends, fetchIncomingRequests as fetchIncomingRequestsApi } from '../api/friend';

export const useFriendStore = create((set) => ({
    friends: [],
    incomingRequests: [],
    sentRequestIds: new Set(),
    // 수락/거절 처리된 UUID — useFriendSearch에서 해당 행을 검색 결과에서 즉시 숨김
    resolvedRequestIds: new Set(),

    fetchFriends: async () => {
        try {
            const friendsData = await fetchMyFriends();
            set({ friends: friendsData });
        } catch (error) {
            console.error("친구 목록 불러오기 실패", error);
        }
    },

    fetchIncomingRequests: async () => {
        try {
            const requests = await fetchIncomingRequestsApi();
            set({ incomingRequests: requests });
        } catch (error) {
            console.error("받은 친구 신청 불러오기 실패", error);
        }
    },

    /** 수락/거절 직후 낙관적으로 제거합니다. 서버 재조회 없이 즉시 반영됩니다. */
    removeIncomingRequest: (requestId) => set((state) => ({
        incomingRequests: state.incomingRequests.filter((r) => r.request_id !== requestId),
    })),

    setIncomingRequests: (requests) => set({ incomingRequests: requests }),

    addSentRequest: (uuid) => set((state) => ({
        sentRequestIds: new Set(state.sentRequestIds).add(uuid),
    })),

    /**
     * 상대방이 수락/거절하면 sentRequestIds에서 제거하고 resolvedRequestIds에 추가합니다.
     * resolvedRequestIds에 있는 UUID는 useFriendSearch에서 검색 결과 행을 즉시 숨깁니다.
     */
    removeSentRequest: (uuid) => set((state) => {
        const nextSent = new Set(state.sentRequestIds);
        nextSent.delete(uuid);
        const nextResolved = new Set(state.resolvedRequestIds).add(uuid);
        return { sentRequestIds: nextSent, resolvedRequestIds: nextResolved };
    }),

    /** 새 검색 시 이전 처리 결과를 초기화합니다. */
    clearResolvedRequests: () => set({ resolvedRequestIds: new Set() }),

    /**
     * @param {string} uuid
     * @param {'ONLINE'|'OFFLINE'} status
     */
    updateFriendStatus: (uuid, status) => set((state) => ({
        friends: state.friends.map((friend) =>
            friend.id === uuid
                ? { ...friend, status, online: status !== 'OFFLINE' }
                : friend
        ),
    })),
}));
