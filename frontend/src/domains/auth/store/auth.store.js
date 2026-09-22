// Zustand로 전역 상태 store를 만들기 위한 함수입니다.
import { create } from "zustand";

// persist 미들웨어는 store 상태 일부를 localStorage에 저장해 새로고침 후에도 유지해줍니다.
import { persist } from "zustand/middleware";

// localStorage에 저장될 auth store key 이름입니다.
const AUTH_STORAGE_KEY = "auth-storage";

// store 전체가 아니라 새로고침 후에도 필요한 값만 localStorage에 저장합니다.
// loggedOutIntentionally는 새로고침 뒤까지 유지할 필요가 없어서 제외합니다.
const persistAuthState = (state) => ({
    isLoggedIn: state.isLoggedIn,
    user: state.user,
});

// 컴포넌트에서 "인증된 사용자냐?"만 꺼내 쓸 때 사용하는 selector입니다.
// 로그인 상태가 true이고 user 정보도 있을 때만 인증된 상태로 봅니다.
export const selectIsAuthenticated = (state) => state.isLoggedIn && state.user != null;

// 사용자가 직접 로그아웃했는지 여부만 꺼내 쓸 때 사용하는 selector입니다.
export const selectLoggedOutIntentionally = (state) => state.loggedOutIntentionally;

// 로그인 상태를 전역에서 사용할 수 있게 만든 auth store입니다.
export const useAuthStore = create(
    persist(
        // set은 Zustand 상태를 변경할 때 사용하는 함수입니다.
        (set) => ({
            // 현재 로그인 여부입니다.
            isLoggedIn: false,

            // 로그인한 사용자 정보입니다. 로그인 전에는 null입니다.
            user: null,

            // 사용자가 직접 로그아웃했는지 표시하는 값입니다.
            // 자동 로그아웃/초기 진입과 직접 로그아웃을 구분할 때 사용할 수 있습니다.
            loggedOutIntentionally: false,

            /**
             * F-21(AC-05): **인증 전이 세대.** 로그인·로그아웃마다 단조 증가한다.
             *
             * "지금 계정이 같은가"는 A→B→A를 구별하지 못한다 — uuid가 원래대로 돌아오기 때문이다.
             * 그 사이에 날아간 요청의 늦은 ACK는 지금 화면의 것이 아니므로, 계정 값이 아니라
             * **전이 횟수**를 캡처해 비교해야 한다. 이 값은 persist하지 않는다(새로고침은 새
             * 프로세스이고, 이전 세대의 in-flight 요청도 함께 사라진다).
             */
            identityGeneration: 0,

            /**
             * 앱 시작 시 서버 세션(/auth/me) 대조 진행 상태다. "idle" → "pending" → "done".
             * persist하지 않는다(새 프로세스마다 다시 대조한다). ProtectedRoute는 "pending"
             * 동안 아무것도 그리지 않는다 — utils/bootstrapSession.js 참고.
             */
            sessionBootstrap: "idle",
            setSessionBootstrap: (sessionBootstrap) => set({ sessionBootstrap }),

            // 서버가 준 role만 갱신한다(같은 계정 — 세대는 올리지 않는다).
            adoptRole: (role) => set((state) => (state.user ? { user: { ...state.user, role } } : {})),

            // 로그인 성공 시 호출합니다.
            // 로그인 상태와 사용자 정보를 저장하고, 직접 로그아웃 플래그는 꺼둡니다.
            login: (user) => {
                return set((state) => ({
                    isLoggedIn: true, user, loggedOutIntentionally: false,
                    identityGeneration: state.identityGeneration + 1,
                }));
            },

            // 로그아웃 시 호출합니다.
            // 로그인 상태와 사용자 정보를 비우고, 사용자가 직접 로그아웃했다는 표시를 남깁니다.
            logout: () => {
                return set((state) => ({
                    isLoggedIn: false, user: null, loggedOutIntentionally: true,
                    identityGeneration: state.identityGeneration + 1,
                }));
            },

            // 직접 로그아웃 표시를 다시 초기화합니다.
            clearLoggedOutIntentionally: () => set({ loggedOutIntentionally: false}),
        }),
        {
            // localStorage에 저장될 key 이름입니다.
            name: AUTH_STORAGE_KEY,

            // 새로고침 후에도 필요한 로그인 상태와 사용자 정보만 저장합니다.
            partialize: persistAuthState,
        }
    )
);
