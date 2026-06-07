import { create } from 'zustand';
import { getFriendsApi } from '../api/friend';

export const useFriendStore = create((set) => ({
  friends: [], // 서버에서 받아온 전체 친구 목록
  
  // API를 호출해서 friends 배열에 데이터를 채우는 함수
  fetchFriends: async () => {
    try {
      const friendsData = await getFriendsApi();
      set({ friends: friendsData});
      console.log("친구 목록 세팅 완료:", friendsData);
    } catch (error) {
      console.error("친구 목록 불러오기 실패", error);
    }
  }
}));