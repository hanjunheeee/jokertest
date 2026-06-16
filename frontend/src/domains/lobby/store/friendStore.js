/**
 * @file friendStore.js
 * @desc 친구 목록 상태 스토어. 전체 갱신(fetchFriends)과 개별 상태 갱신(updateFriendStatus)을 제공합니다.
 */

import { create } from 'zustand';
import { fetchMyFriends } from '../api/friend';

export const useFriendStore = create((set) => ({
    friends: [],

    /** 서버에서 친구 목록 전체를 불러와 스토어를 갱신합니다. */
    fetchFriends: async () => {
        try {
            const friendsData = await fetchMyFriends();
            set({ friends: friendsData });
        } catch (error) {
            console.error("친구 목록 불러오기 실패", error);
        }
    },

    /**
     * 소켓 `friend_status_change` 이벤트 수신 시 해당 친구 항목만 갱신합니다.
     * @param {string} uuid
     * @param {string} status - 'ONLINE' | 'OFFLINE'
     */
    updateFriendStatus: (uuid, status) => set((state) => ({
        friends: state.friends.map((friend) =>
            friend.id === uuid
                ? { ...friend, status, online: status !== 'OFFLINE' }
                : friend
        ),
    })),
}));
