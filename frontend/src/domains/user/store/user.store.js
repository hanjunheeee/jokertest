import { create } from 'zustand';
import { getMyProfileApi } from '../api/user.api';

// 마이페이지/로비가 각자 따로 GET /user/me/profile을 부르던 걸 하나의 캐시로 공유합니다.
// friend.store.js와 같은 패턴 — 데이터를 스토어에 두고, 이미 있으면 재요청하지 않습니다.
export const useUserProfileStore = create((set) => ({
    data: null,
    loading: true,

    fetchProfile: async () => {
        try {
            const data = await getMyProfileApi();
            set({ data, loading: false });
        } catch (error) {
            console.error("프로필 불러오기 실패", error);
            set({ loading: false });
        }
    },

    // 닉네임 변경처럼 서버 값이 바뀐 걸 이미 알고 있을 때, 재요청 없이 캐시를 바로 갱신합니다.
    patchProfile: (patch) => set((state) => ({
        data: state.data ? { ...state.data, ...patch } : state.data,
    })),
}));
