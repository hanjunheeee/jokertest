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

  // game_phase_changed 방송을 반영한다. payload는 신뢰하지 않는 외부 입력이므로 구조분해
  // 전에 형태부터 검증한다 — 이번 슬라이스가 다루는 전이(ROLE_REVEAL→NIGHT, dayIndex 0
  // 유지)와 정확히 일치할 때만 반영하고, 그 외에는 store를 전혀 건드리지 않는다. set()에
  // 넘긴 current를 그대로 돌려주면 zustand가 참조 변경 없이 완전한 no-op으로 처리한다
  // (Object.is로 이전 state와 같은 참조인지 비교해, 같으면 리스너조차 호출하지 않는다).
  applyPhaseChanged: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (payload.phase !== "NIGHT") return current
      if (payload.dayIndex !== 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "ROLE_REVEAL") return current

      return { state: { ...current.state, phase: payload.phase, dayIndex: payload.dayIndex } }
    }),

  setGameError: (error) => set({ error }),

  clearGame: () => set({ gameId: null, state: null, error: null }),
}))

export const selectInGameState = (store) => store.state
