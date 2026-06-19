import { create } from 'zustand'

/**
 * 매칭 큐·방 상태를 전역으로 관리합니다.
 * match_found → setRoom → GameMatchingPage가 store를 읽어 렌더링합니다.
 */
export const useMatchingStore = create((set) => ({
  isSearching: false,
  isInRoom: false,
  roomId: null,
  roomCode: null,
  players: [],      // { uuid, nickname }[]
  hostUuid: null,

  startSearch: () => set({ isSearching: true }),
  stopSearch:  () => set({ isSearching: false }),

  setRoom: ({ roomId, roomCode, players, hostUuid }) =>
    set({ isSearching: false, isInRoom: true, roomId, roomCode, players, hostUuid }),

  addPlayer: (player) =>
    set((s) => ({ players: [...s.players, player] })),

  removePlayer: (uuid) =>
    set((s) => ({ players: s.players.filter((p) => p.uuid !== uuid) })),

  updateHost: (hostUuid) => set({ hostUuid }),

  clearRoom: () =>
    set({ isInRoom: false, roomId: null, roomCode: null, players: [], hostUuid: null }),
}))
