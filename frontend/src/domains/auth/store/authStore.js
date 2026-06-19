/**
 * @file authStore.js
 * @desc 로그인 상태와 유저 정보를 관리하는 Zustand 스토어. localStorage에 persist됩니다.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LOBBY_INTRO_SESSION_KEY } from "@/domains/lobby/hooks/useLobbyIntro";

export const useAuthStore = create(
    persist(
        (set) => ({
            isLoggedIn: false,
            user:       null,
            login: (user) => {
                // 로그인마다 인트로 기록을 초기화해 이번 세션에서 정확히 한 번 재생되도록 보장
                localStorage.removeItem(LOBBY_INTRO_SESSION_KEY);
                return set({ isLoggedIn: true, user });
            },
            logout: () => {
                localStorage.removeItem(LOBBY_INTRO_SESSION_KEY);
                return set({ isLoggedIn: false, user: null });
            },
        }),
        {
            name:       "auth-storage",
            partialize: (state) => ({ isLoggedIn: state.isLoggedIn, user: state.user }),
        }
    )
);

/** isLoggedIn && user 둘 다 있을 때만 인증됨으로 간주 */
export const selectIsAuthenticated = (state) => state.isLoggedIn && state.user != null;
