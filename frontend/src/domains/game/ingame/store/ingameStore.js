// 파일 역할: ingameStore.js - 전역 상태 store입니다.
import { create } from "zustand"

/**
 * 서버 인게임 상태를 보관하는 클라이언트 store.
 * 도메인 판정은 서버 game-core가 담당하고, 프론트는 동기화된 상태를 렌더링만 합니다.
 *
 * Room→GameSession 전환(useMatchingRoom의 game_started 핸들러가 setGamePayload를 호출)은
 * 구현됐지만, 인게임 진입 후 실시간으로 state를 갱신하는 소켓 연결(useInGameSocket)은 아직
 * 없습니다 — 게임 시작 직후 받은 초기 state(ROLE_REVEAL 단계)에서 더 이상 갱신되지 않고,
 * 화면은 그 정적인 state 위에 프리뷰(더미) 데이터를 일부 섞어 렌더링됩니다.
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
