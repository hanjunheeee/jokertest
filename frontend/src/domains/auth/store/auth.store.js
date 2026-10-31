import { create } from "zustand";

import { persist } from "zustand/middleware";

const AUTH_STORAGE_KEY = "auth-storage";

const persistAuthState = (state) => ({
    isLoggedIn: state.isLoggedIn,
    user: state.user,
});

export const selectIsAuthenticated = (state) => state.isLoggedIn && state.user != null;

export const selectLoggedOutIntentionally = (state) => state.loggedOutIntentionally;

export const useAuthStore = create(
    persist(
        (set) => ({
            isLoggedIn: false,

            user: null,

            loggedOutIntentionally: false,

            identityGeneration: 0,

            sessionBootstrap: "idle",
            setSessionBootstrap: (sessionBootstrap) => set({ sessionBootstrap }),

            adoptRole: (role) => set((state) => (state.user ? { user: { ...state.user, role } } : {})),

            login: (user) => {
                return set((state) => ({
                    isLoggedIn: true, user, loggedOutIntentionally: false,
                    identityGeneration: state.identityGeneration + 1,
                }));
            },

            logout: () => {
                return set((state) => ({
                    isLoggedIn: false, user: null, loggedOutIntentionally: true,
                    identityGeneration: state.identityGeneration + 1,
                }));
            },

            clearLoggedOutIntentionally: () => set({ loggedOutIntentionally: false}),
        }),
        {
            name: AUTH_STORAGE_KEY,

            partialize: persistAuthState,
        }
    )
);
