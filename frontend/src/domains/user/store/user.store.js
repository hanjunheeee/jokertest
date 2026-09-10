import { create } from 'zustand';
import { getMyProfileApi } from '../api/user.api.js';
import { useAuthStore } from '../../auth/store/auth.store.js';

// 마이페이지/로비가 각자 따로 GET /user/me/profile을 부르던 걸 하나의 캐시로 공유합니다.
// friend.store.js와 같은 패턴 — 데이터를 스토어에 두고, 이미 있으면 재요청하지 않습니다.
//
// F-10 A-08: economy.store.js와 같은 이유로 requestGeneration을 둔다 — 이전에는 reset()이
// data만 비울 뿐 진행 중이던 fetchProfile 요청을 무효화하지 않아서, 계정 전환/로그아웃 뒤에
// 늦게 도착한 이전 계정의 응답이 새 계정 화면을 덮어쓸 수 있었다.
export const useUserProfileStore = create((set, get) => ({
    data: null,
    loading: true,
    requestGeneration: 0,

    fetchProfile: async () => {
        const generation = get().requestGeneration;
        try {
            const data = await getMyProfileApi();
            // 응답이 도착하기 전에 로그아웃했거나 다른 계정으로 전환됐다면 더 이상 "지금 이
            // 화면"의 응답이 아니다 — 조용히 버린다.
            if (get().requestGeneration !== generation) return;
            set({ data, loading: false });
        } catch (error) {
            if (get().requestGeneration !== generation) return;
            console.error("프로필 불러오기 실패", error);
            set({ loading: false });
        }
    },

    // 닉네임 변경처럼 서버 값이 바뀐 걸 이미 알고 있을 때, 재요청 없이 캐시를 바로 갱신합니다.
    patchProfile: (patch) => set((state) => ({
        data: state.data ? { ...state.data, ...patch } : state.data,
    })),

    // 계정 경계를 넘는 상태를 지우고 진행 중이던 요청을 전부 무효화한다(requestGeneration 증가).
    reset: () => set((state) => ({ data: null, loading: true, requestGeneration: state.requestGeneration + 1 })),
}));

// 로그아웃이든 계정 전환이든 계정 식별자가 바뀌는 순간 즉시 리셋한다(economy.store.js와 동일 계약).
useAuthStore.subscribe((state, prevState) => {
    const nextUserId = state.user?.uuid ?? null;
    const prevUserId = prevState?.user?.uuid ?? null;
    if (nextUserId !== prevUserId) {
        useUserProfileStore.getState().reset();
    }
});
