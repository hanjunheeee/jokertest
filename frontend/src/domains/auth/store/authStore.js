import { create } from 'zustand'
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
    persist(
    (set) => ({
      isLoggedIn: false, // 초기 상태
      login: () => set({ isLoggedIn: true }),
      logout: () => set({ isLoggedIn: false }),
    }),
    {
      name: 'auth-storage', // 로컬 스토리지에 저장될 이름
    }
  )
)