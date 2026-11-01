// 내 프로필(전적) 스토어 (받기·무효화·같은 요청 합치기·계정 바뀌면 비우기)
// useMyProfile·ProtectedRoute(계정 캐시 등록)·닉네임 폼·스킨 미리보기·시험이 씀
import { create } from 'zustand';
import { getMyProfileApi } from '../api/user.api.js';
import { useAuthStore } from '../../auth/store/auth.store.js';

// 진행 중 요청 (같은 세대·같은 무효화 번호면 이걸 같이 기다림)
let inFlightProfileFetch = null;

// 요청 순번: 늦게 끝난 옛 요청이 새 결과를 덮지 못하게 함
let profileFetchSequence = 0;
let appliedFetchSeq = 0;

// 화면에 보일 수 있는 판수·승률인지
const isDisplayableGameCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isDisplayableWinRate = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

// 판수·승률을 못 보이는 응답이면 실패로 봄
function assertDisplayableProfile(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('프로필 응답이 객체가 아닙니다.');
    }
    if (!isDisplayableGameCount(data.total_games)) {
        throw new Error(`프로필 응답의 전체 판수를 표시할 수 없습니다: ${String(data.total_games)}`);
    }
    if (!isDisplayableWinRate(data.account_win_rate)) {
        throw new Error(`프로필 응답의 승률을 표시할 수 없습니다: ${String(data.account_win_rate)}`);
    }
}

// 상태: 프로필·불러오는 중·오류, 세대(초기화마다 올림)·무효화 번호·반영한 무효화 번호
export const useUserProfileStore = create((set, get) => ({
    data: null,
    loading: true,
    requestGeneration: 0,

    error: null,

    invalidationRevision: 0,
    appliedRevision: 0,

    // 받기: 그사이 초기화·무효화·더 새 요청 반영이 있었으면 버림
    fetchProfile: async () => {
        const generation = get().requestGeneration;
        const startedAtRevision = get().invalidationRevision;
        profileFetchSequence += 1;
        const sequence = profileFetchSequence;
        try {
            const data = await getMyProfileApi();
            if (get().requestGeneration !== generation) return;
            if (get().invalidationRevision !== startedAtRevision) return;
            if (sequence < appliedFetchSeq) return;
            assertDisplayableProfile(data);
            appliedFetchSeq = sequence;
            set({ data, loading: false, appliedRevision: startedAtRevision, error: null });
        } catch (error) {
            // 실패도 같은 검사 뒤 오류 표시 (옛 프로필은 그대로 둠)
            if (get().requestGeneration !== generation) return;
            if (get().invalidationRevision !== startedAtRevision) return;
            if (sequence < appliedFetchSeq) return;
            appliedFetchSeq = sequence;
            console.error("프로필 불러오기 실패", error);
            set({ loading: false, error: { message: "프로필을 불러오지 못했습니다." } });
        }
    },

    // 무효화: 번호를 올리고 다시 받음 (그 전에 시작한 요청 결과는 버려짐)
    invalidate: () => {
        set((state) => ({ invalidationRevision: state.invalidationRevision + 1 }));
        return get().refresh();
    },

    // 다시 받기: 같은 세대·같은 무효화 번호로 진행 중이면 그 요청을 같이 기다림
    refresh: () => {
        const generation = get().requestGeneration;
        const revision = get().invalidationRevision;
        if (inFlightProfileFetch
            && inFlightProfileFetch.generation === generation
            && inFlightProfileFetch.revision === revision) {
            return inFlightProfileFetch.promise;
        }
        const promise = get().fetchProfile().finally(() => {
            if (inFlightProfileFetch && inFlightProfileFetch.promise === promise) inFlightProfileFetch = null;
        });
        inFlightProfileFetch = { generation, revision, promise };
        return promise;
    },

    // 마지막 무효화가 아직 반영 안 됐는지
    isStale: () => get().appliedRevision < get().invalidationRevision,

    // 일부 칸만 고침 (닉네임 바꾼 뒤), 프로필이 없으면 그대로
    patchProfile: (patch) => set((state) => ({
        data: state.data ? { ...state.data, ...patch } : state.data,
    })),

    // 비우기: 세대·무효화 번호를 올리고 진행 중 요청을 버림
    reset: () => set((state) => {
        inFlightProfileFetch = null;
        appliedFetchSeq = profileFetchSequence;
        return {
            data: null,
            loading: true,
            error: null,
            requestGeneration: state.requestGeneration + 1,
            invalidationRevision: state.invalidationRevision + 1,
            appliedRevision: state.invalidationRevision + 1,
        };
    }),
}));

// 계정이 바뀌면 비움
useAuthStore.subscribe((state, prevState) => {
    const nextUserId = state.user?.uuid ?? null;
    const prevUserId = prevState?.user?.uuid ?? null;
    if (nextUserId !== prevUserId) {
        useUserProfileStore.getState().reset();
    }
});
