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

    // F-21(A-10): 서버가 "이 계정의 전적이 방금 커밋됐다"고 알려준 횟수다. requestGeneration과
    // 나누는 이유는 묻는 것이 다르기 때문이다 — 그쪽은 "아직 같은 계정인가"이고, 이쪽은
    // "이 응답이 무효화보다 **나중에 시작된** 조회인가"다.
    //
    // 이 값이 없으면 실패하는 순서가 실제로 있다: 커밋 직전에 시작된 GET이 무효화 신호보다
    // 늦게 도착하면, 같은 계정이고 세대도 같으므로 옛 숫자가 최신 화면을 덮어쓴다.
    invalidationRevision: 0,
    // 마지막으로 성공적으로 반영된 응답이 어느 무효화 세대에서 시작됐는가. staleness 판정과
    // "무효화 이후 서버 조회가 한 번은 있었는가"의 근거다.
    appliedRevision: 0,

    fetchProfile: async () => {
        const generation = get().requestGeneration;
        // 이 조회가 시작된 시점의 무효화 세대를 함께 캡처한다.
        const startedAtRevision = get().invalidationRevision;
        try {
            const data = await getMyProfileApi();
            // 응답이 도착하기 전에 로그아웃했거나 다른 계정으로 전환됐다면 더 이상 "지금 이
            // 화면"의 응답이 아니다 — 조용히 버린다.
            if (get().requestGeneration !== generation) return;
            // 이 조회가 시작된 뒤에 무효화가 왔다면 이 응답은 이미 낡은 값이다. 버리고,
            // 그 무효화가 요구한 서버 조회는 따로 수행된다(아래 invalidate가 건다).
            if (get().invalidationRevision !== startedAtRevision) return;
            set({ data, loading: false, appliedRevision: startedAtRevision });
        } catch (error) {
            if (get().requestGeneration !== generation) return;
            if (get().invalidationRevision !== startedAtRevision) return;
            console.error("프로필 불러오기 실패", error);
            set({ loading: false });
        }
    },

    /**
     * F-21(A-10): 서버 전적 커밋 이후의 개인 무효화. 캐시를 비우지 않고 **세대만** 올린 뒤
     * 새 조회를 시작한다 — 비우면 화면이 잠깐 빈 값으로 깜빡이고, 그 사이 도착한 옛 응답이
     * 다시 들어올 수 있다.
     */
    invalidate: () => {
        set((state) => ({ invalidationRevision: state.invalidationRevision + 1 }));
        return get().fetchProfile();
    },

    /** 지금 들고 있는 값이 마지막 무효화보다 오래됐는가(화면이 stale 표시를 붙일 근거). */
    isStale: () => get().appliedRevision < get().invalidationRevision,

    // 닉네임 변경처럼 서버 값이 바뀐 걸 이미 알고 있을 때, 재요청 없이 캐시를 바로 갱신합니다.
    patchProfile: (patch) => set((state) => ({
        data: state.data ? { ...state.data, ...patch } : state.data,
    })),

    // 계정 경계를 넘는 상태를 지우고 진행 중이던 요청을 전부 무효화한다(requestGeneration 증가).
    reset: () => set((state) => ({
        data: null,
        loading: true,
        requestGeneration: state.requestGeneration + 1,
        // 무효화 세대는 되돌리지 않는다 — 단조 증가해야 A→B→A 계정 전환 뒤에 도착한 옛
        // 응답이 "세대가 같다"는 이유로 되살아나지 않는다.
        invalidationRevision: state.invalidationRevision + 1,
        appliedRevision: state.invalidationRevision + 1,
    })),
}));

// 로그아웃이든 계정 전환이든 계정 식별자가 바뀌는 순간 즉시 리셋한다(economy.store.js와 동일 계약).
useAuthStore.subscribe((state, prevState) => {
    const nextUserId = state.user?.uuid ?? null;
    const prevUserId = prevState?.user?.uuid ?? null;
    if (nextUserId !== prevUserId) {
        useUserProfileStore.getState().reset();
    }
});
