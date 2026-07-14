// 파일 역할: ingameStore.js - 전역 상태 store입니다.
import { create } from "zustand"

/**
 * 서버 인게임 상태를 보관하는 클라이언트 store.
 * 도메인 판정은 서버 game-core가 담당하고, 프론트는 동기화된 상태를 렌더링만 합니다.
 *
 * 지금은 백엔드 game-core/gameSession이 없어서 setGamePayload를 실제로 호출하는
 * 소켓 연결(useInGameSocket)은 뺐습니다 — state는 항상 null이고, 화면은 프리뷰(더미) 모드로 렌더링됩니다.
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
