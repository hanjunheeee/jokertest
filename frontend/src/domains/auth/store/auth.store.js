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

            // 로그인 성공 시 호출합니다.
            // 로그인 상태와 사용자 정보를 저장하고, 직접 로그아웃 플래그는 꺼둡니다.
            login: (user) => {
                return set({ isLoggedIn: true, user, loggedOutIntentionally: false});
            },

            // 로그아웃 시 호출합니다.
            // 로그인 상태와 사용자 정보를 비우고, 사용자가 직접 로그아웃했다는 표시를 남깁니다.
            logout: () => {
                return set({ isLoggedIn: false, user: null, loggedOutIntentionally: true});
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
