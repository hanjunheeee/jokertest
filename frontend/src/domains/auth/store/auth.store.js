// 로그인 상태 store (내 계정 user, 일부러 로그아웃함 표시, 세션 확인 단계, 계정 세대 번호)
// app/App.jsx·shared/ui/ProtectedRoute.jsx·auth 훅과 게임·로비·상점 등 계정 쓰는 곳이 사용
import { create } from "zustand";

import { persist } from "zustand/middleware";

// localStorage 키 (바꾸면 저장된 로그인 상태를 못 읽음)
const AUTH_STORAGE_KEY = "auth-storage";

// 저장은 로그인 여부·user만, 나머지는 새로고침 때 처음 값
const persistAuthState = (state) => ({
    isLoggedIn: state.isLoggedIn,
    user: state.user,
});

// user까지 있어야 로그인으로 봄
export const selectIsAuthenticated = (state) => state.isLoggedIn && state.user != null;

// 일부러 로그아웃했는지 (보호 화면이 로그인 필요 알림을 안 띄움)
export const selectLoggedOutIntentionally = (state) => state.loggedOutIntentionally;

// 새로고침 뒤에도 로그인 상태 유지, 진짜 세션은 bootstrapSession이 다시 확인
export const useAuthStore = create(
    persist(
        (set) => ({
            isLoggedIn: false,

            user: null,

            // logout 뒤 켜짐 (401·세션 확인 실패 때도), 로그인 화면에 오면 꺼짐
            loggedOutIntentionally: false,

            // 로그인·로그아웃마다 올림, 게임 쪽이 계정 바뀜을 가려낼 때 씀
            identityGeneration: 0,

            // 세션 확인 단계 idle → pending → done (bootstrapSession이 바꿈)
            sessionBootstrap: "idle",
            setSessionBootstrap: (sessionBootstrap) => set({ sessionBootstrap }),

            // 서버 role만 맞춤 (user 없으면 그대로)
            adoptRole: (role) => set((state) => (state.user ? { user: { ...state.user, role } } : {})),

            // 로그인: 일부러 로그아웃함 표시 끄고 세대 올림
            login: (user) => {
                return set((state) => ({
                    isLoggedIn: true, user, loggedOutIntentionally: false,
                    identityGeneration: state.identityGeneration + 1,
                }));
            },

            // 로그아웃: user 비우고 일부러 로그아웃함 표시 켬, 세대 올림
            logout: () => {
                return set((state) => ({
                    isLoggedIn: false, user: null, loggedOutIntentionally: true,
                    identityGeneration: state.identityGeneration + 1,
                }));
            },

            // 로그인 화면에 오면 hooks/useLoginPage.js가 부름
            clearLoggedOutIntentionally: () => set({ loggedOutIntentionally: false}),
        }),
        {
            name: AUTH_STORAGE_KEY,

            partialize: persistAuthState,
        }
    )
);
