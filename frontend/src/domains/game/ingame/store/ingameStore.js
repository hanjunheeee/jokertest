import { create } from "zustand"

/**
 * 서버 인게임 상태를 보관하는 클라이언트 store.
 * 도메인 판정은 서버 game-core가 담당하고, 프론트는 동기화된 상태를 렌더링만 합니다.
 */
export const useInGameStore = create((set) => ({
  gameId: null,
  state: null,
  error: null,

  setGamePayload: ({ gameId, state }) =>
    set({ gameId: gameId ?? state?.id ?? null, state: state ?? null, error: null }),

  setGameError: (error) => set({ error }),

  clearGame: () => set({ gameId: null, state: null, error: null }),
}))

export const selectInGameState = (store) => store.state
