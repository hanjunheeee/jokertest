/**
 * @file authStore.js
 * @desc 로그인 상태와 유저 정보를 관리하는 Zustand 스토어. localStorage에 persist됩니다.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
    persist(
        (set) => ({
            isLoggedIn: false,
            user:       null,
            login:      (user) => set({ isLoggedIn: true, user }),
            logout:     ()     => set({ isLoggedIn: false, user: null }),
        }),
        {
            name:        "auth-storage",
            partialize: (state) => ({ isLoggedIn: state.isLoggedIn, user: state.user }), // login·logout 제외하고 영속
        }
    )
);

/** isLoggedIn && user 둘 다 있을 때만 인증됨으로 간주 */
export const selectIsAuthenticated = (state) => state.isLoggedIn && state.user != null;
