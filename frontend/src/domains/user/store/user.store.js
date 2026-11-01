import { create } from 'zustand';
import { getMyProfileApi } from '../api/user.api.js';
import { useAuthStore } from '../../auth/store/auth.store.js';

let inFlightProfileFetch = null;

let profileFetchSequence = 0;
let appliedFetchSeq = 0;

const isDisplayableGameCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isDisplayableWinRate = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

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

export const useUserProfileStore = create((set, get) => ({
    data: null,
    loading: true,
    requestGeneration: 0,

    error: null,

    invalidationRevision: 0,
    appliedRevision: 0,

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
            if (get().requestGeneration !== generation) return;
            if (get().invalidationRevision !== startedAtRevision) return;
            if (sequence < appliedFetchSeq) return;
            appliedFetchSeq = sequence;
            console.error("프로필 불러오기 실패", error);
            set({ loading: false, error: { message: "프로필을 불러오지 못했습니다." } });
        }
    },

    invalidate: () => {
        set((state) => ({ invalidationRevision: state.invalidationRevision + 1 }));
        return get().refresh();
    },

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

    isStale: () => get().appliedRevision < get().invalidationRevision,

    patchProfile: (patch) => set((state) => ({
        data: state.data ? { ...state.data, ...patch } : state.data,
    })),

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

useAuthStore.subscribe((state, prevState) => {
    const nextUserId = state.user?.uuid ?? null;
    const prevUserId = prevState?.user?.uuid ?? null;
    if (nextUserId !== prevUserId) {
        useUserProfileStore.getState().reset();
    }
});
