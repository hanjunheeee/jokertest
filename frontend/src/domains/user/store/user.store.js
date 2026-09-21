import { create } from 'zustand';
import { getMyProfileApi } from '../api/user.api.js';
import { useAuthStore } from '../../auth/store/auth.store.js';

// 마이페이지/로비가 각자 따로 GET /user/me/profile을 부르던 걸 하나의 캐시로 공유합니다.
// friend.store.js와 같은 패턴 — 데이터를 스토어에 두고, 이미 있으면 재요청하지 않습니다.
//
// F-10 A-08: economy.store.js와 같은 이유로 requestGeneration을 둔다 — 이전에는 reset()이
// data만 비울 뿐 진행 중이던 fetchProfile 요청을 무효화하지 않아서, 계정 전환/로그아웃 뒤에
// 늦게 도착한 이전 계정의 응답이 새 계정 화면을 덮어쓸 수 있었다.
// F-21(A-10): 지금 날아가 있는 조회 하나. { generation, revision, promise } 또는 null.
let inFlightProfileFetch = null;

/**
 * F-21(A-10): 이 프로세스에서 시작된 프로필 조회의 순번. **같은 계정·같은 무효화 세대** 안의
 * 순서를 구별하는 유일한 근거다.
 *
 * requestGeneration은 "아직 같은 계정인가", invalidationRevision은 "무효화보다 나중에 시작된
 * 조회인가"를 묻는다. 둘 다 같은 두 조회가 동시에 날아가는 경우(로비와 마이페이지가 refresh를
 * 거치지 않고 fetchProfile을 직접 부르는 등)는 어느 쪽도 걸러내지 못한다 — 먼저 시작한 조회의
 * 응답이 나중에 도착하면 옛 값이 최신 값을 덮는다. refresh()의 single-flight는 **자기 경로로
 * 들어온 호출만** 합치므로 직접 호출자를 보호하지 못한다.
 */
let profileFetchSequence = 0;
/** 마지막으로 화면에 반영된 조회의 순번. 이보다 이른 조회의 응답은 이미 낡은 값이다. */
let appliedProfileFetchSequence = 0;

/**
 * F-30 AC-03: **표시할 수 없는 응답을 성공으로 캐시하지 않는다.**
 *
 * 마이페이지의 전체 판수·승률은 이 캐시를 그대로 읽어 그린다. 누락·문자열·NaN·무한대·음수·
 * 범위를 벗어난 승률이 그대로 들어오면 화면은 "0판 0.0%"나 "NaN%" 같은 값을 **정상 조회 결과로**
 * 보여주게 된다 — 조회가 잘못됐다는 사실이 0판으로 위장되는 바로 그 경우다. 여기서 거르면
 * 아래 catch가 기존 캐시를 보존한 채 실패 상태만 남기고, 화면은 다시 읽는 경로를 내놓는다.
 *
 * 판수는 음수가 아닌 **안전 정수**여야 한다(소수·2^53 이상은 집계 오류이지 큰 전적이 아니다).
 * 승률은 반올림하지 않은 원시 비율이므로 0 이상 1 이하의 유한한 number여야 한다.
 */
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

    /**
     * F-21(A-10): **지금 들고 있는 값이 확인된 값인가.** 마지막 조회가 실패했으면 그 사실이다.
     *
     * 이 값이 없으면 실패하는 경우가 있다: 무효화 신호를 놓친 채(끊겨 있던 사이의 커밋, 다른
     * 탭에서 지나간 신호, CLI 복구 지급) 재진입 refresh가 실패하면, invalidationRevision이
     * 오르지 않았으므로 staleness 판정은 false이고 캐시는 그대로다 — 화면은 낡았을 수 있는
     * 숫자를 아무 표시 없이 계속 보여주고 다시 읽을 경로도 내놓지 않는다. 캐시는 그대로 두되
     * (쓸 수 있는 값을 지우지 않는다) 실패했다는 사실만 함께 남긴다.
     */
    error: null,

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

    // F-21(A-10): 지금 진행 중인 조회 하나(같은 계정·같은 무효화 세대)를 합치기 위한 핸들이다.
    // store 상태가 아니라 클로저 변수로 두는 이유는 렌더 입력이 아니기 때문이다 — 이 값이
    // 바뀌었다고 화면이 다시 그려질 이유는 없다.
    //
    // 합치는 범위를 **같은 무효화 세대**로 한정한다. 무효화 이후의 refresh까지 이전 in-flight에
    // 합치면 "무효화가 새 서버 조회를 보장한다"가 깨진다(이미 낡은 응답을 그대로 재사용하게 된다).
    fetchProfile: async () => {
        const generation = get().requestGeneration;
        // 이 조회가 시작된 시점의 무효화 세대를 함께 캡처한다.
        const startedAtRevision = get().invalidationRevision;
        // 같은 계정·같은 세대 안의 순서. 늦게 도착한 **이른** 조회를 버리는 근거다.
        profileFetchSequence += 1;
        const sequence = profileFetchSequence;
        try {
            const data = await getMyProfileApi();
            // 응답이 도착하기 전에 로그아웃했거나 다른 계정으로 전환됐다면 더 이상 "지금 이
            // 화면"의 응답이 아니다 — 조용히 버린다.
            if (get().requestGeneration !== generation) return;
            // 이 조회가 시작된 뒤에 무효화가 왔다면 이 응답은 이미 낡은 값이다. 버리고,
            // 그 무효화가 요구한 서버 조회는 따로 수행된다(아래 invalidate가 건다).
            if (get().invalidationRevision !== startedAtRevision) return;
            // 더 나중에 시작된 조회가 이미 반영됐다면 이 응답은 그보다 오래된 사실이다.
            if (sequence < appliedProfileFetchSequence) return;
            // F-30 AC-03: **순서 판정을 통과한 뒤에** 내용을 검사한다. 순서를 먼저 보는 이유는,
            // 이미 낡은 응답의 검증 오류까지 현재 계정 화면에 실패로 남겨서는 안 되기 때문이다
            // (그 응답은 애초에 이 화면의 사실이 아니다 — 위 세 검사가 조용히 버린다).
            // 여기서 던지면 아래 catch가 받아 기존 캐시를 보존한 채 실패 상태만 남긴다.
            // appliedProfileFetchSequence는 아직 올리지 않았으므로 catch의 순번 검사도 통과한다.
            assertDisplayableProfile(data);
            appliedProfileFetchSequence = sequence;
            // 성공은 이전 실패를 지운다 — 더 새로운 조회가 확인해 준 값이기 때문이다.
            set({ data, loading: false, appliedRevision: startedAtRevision, error: null });
        } catch (error) {
            if (get().requestGeneration !== generation) return;
            if (get().invalidationRevision !== startedAtRevision) return;
            if (sequence < appliedProfileFetchSequence) return;
            // 실패도 같은 순서 규칙을 따른다 — 이미 최신 값을 받아 둔 화면을 옛 실패가
            // 로딩 해제/오류 표시로 되돌리지 않는다.
            appliedProfileFetchSequence = sequence;
            console.error("프로필 불러오기 실패", error);
            // **캐시는 지우지 않는다.** 마지막으로 확인된 값은 여전히 쓸 수 있는 값이고,
            // 비우면 실패 하나로 화면이 빈 숫자가 된다. 대신 "확인하지 못했다"는 사실을 남겨
            // 화면이 그 상태를 표시하고 다시 읽는 경로를 내놓게 한다.
            //
            // 순서 규칙은 성공과 같다(위 세 검사) — 더 나중에 시작된 조회가 이미 성공해 반영됐다면
            // 이 실패는 그보다 오래된 사실이므로 여기까지 오지 못한다.
            set({ loading: false, error: { message: "프로필을 불러오지 못했습니다." } });
        }
    },

    /**
     * F-21(A-10): 서버 전적 커밋 이후의 개인 무효화. 캐시를 비우지 않고 **세대만** 올린 뒤
     * 새 조회를 시작한다 — 비우면 화면이 잠깐 빈 값으로 깜빡이고, 그 사이 도착한 옛 응답이
     * 다시 들어올 수 있다.
     */
    invalidate: () => {
        set((state) => ({ invalidationRevision: state.invalidationRevision + 1 }));
        // 세대를 올린 **뒤에** 조회한다 — 그래야 아직 날아가 있던 이전 세대의 조회에 합쳐지지
        // 않고, 무효화 이후의 서버 조회가 반드시 한 번 일어난다.
        return get().refresh();
    },

    /**
     * F-21(A-10): 재진입·재연결·창 재활성화가 부르는 **합쳐지는** 조회다.
     *
     * 무효화와 다른 점은 세대를 올리지 않는다는 것뿐이다 — 이 전이들은 "서버가 새 사실을
     * 알려줬다"가 아니라 "그 신호를 못 받았을 수도 있다"이므로, 캐시를 낡았다고 선언하지 않고
     * 값만 다시 확인한다. 같은 계정·같은 무효화 세대의 조회가 이미 날아가 있으면 그것을
     * 그대로 돌려준다(마이페이지와 로비가 동시에 뜨는 흔한 경우에 요청이 두 번 나가지 않는다).
     */
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

    /** 지금 들고 있는 값이 마지막 무효화보다 오래됐는가(화면이 stale 표시를 붙일 근거). */
    isStale: () => get().appliedRevision < get().invalidationRevision,

    // 닉네임 변경처럼 서버 값이 바뀐 걸 이미 알고 있을 때, 재요청 없이 캐시를 바로 갱신합니다.
    patchProfile: (patch) => set((state) => ({
        data: state.data ? { ...state.data, ...patch } : state.data,
    })),

    // 계정 경계를 넘는 상태를 지우고 진행 중이던 요청을 전부 무효화한다(requestGeneration 증가).
    // 진행 중이던 조회 핸들도 함께 버린다 — 남기면 새 계정의 refresh가 **이전 계정의** 응답을
    // 기다리는 promise를 그대로 돌려받는다(그 응답 자체는 아래 세대 검사가 버린다).
    reset: () => set((state) => {
        inFlightProfileFetch = null;
        // 순번도 함께 끊는다 — 계정이 바뀌면 이전 계정의 조회 순서는 더 이상 의미가 없고,
        // 새 계정의 첫 조회가 "이미 더 나중 것이 반영됐다"는 이유로 버려져서도 안 된다.
        appliedProfileFetchSequence = profileFetchSequence;
        return {
            data: null,
            loading: true,
            // 이전 계정의 실패는 새 계정의 사실이 아니다.
            error: null,
            requestGeneration: state.requestGeneration + 1,
            // 무효화 세대는 되돌리지 않는다 — 단조 증가해야 A→B→A 계정 전환 뒤에 도착한 옛
            // 응답이 "세대가 같다"는 이유로 되살아나지 않는다.
            invalidationRevision: state.invalidationRevision + 1,
            appliedRevision: state.invalidationRevision + 1,
        };
    }),
}));

// 로그아웃이든 계정 전환이든 계정 식별자가 바뀌는 순간 즉시 리셋한다(economy.store.js와 동일 계약).
useAuthStore.subscribe((state, prevState) => {
    const nextUserId = state.user?.uuid ?? null;
    const prevUserId = prevState?.user?.uuid ?? null;
    if (nextUserId !== prevUserId) {
        useUserProfileStore.getState().reset();
    }
});
