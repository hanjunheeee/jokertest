import { create } from 'zustand'

/** 매칭/방 대기 화면에서 공유하는 방 상태 store입니다. */
export const useMatchingStore = create((set) => ({
    // 빠른 매칭 검색 중인지 표시합니다.
    isSearching: false,

    // 현재 소켓 방에 들어가 있는지 표시합니다.
    isInRoom: false,

    // 서버가 내려준 방 id입니다.
    roomId: null,

    // 초대에 쓰는 짧은 방 코드입니다.
    roomCode: null,

    // 현재 방에 들어와 있는 플레이어 목록입니다.
    players: [],

    // 현재 방장 uuid입니다.
    hostUuid: null,

    startSearch: () => set({ isSearching: true}),
    stopSearch: () => set({isSearching: false}),

    setRoom: ({ roomId, roomCode, players, hostUuid }) =>
        set({ isSearching: false, isInRoom: true, roomId, roomCode, players, hostUuid}),

    addPlayer: (player) =>
        set((s) => ({ players: [...s.players, player]})),

    removePlayer: (uuid) =>
        set((s) => ({ players: s.players.filter((p) => p.uuid !== uuid)})),

    updateHost: (hostUuid) => set({hostUuid}),

    clearRoom: () =>
        set({ isInRoom: false, roomId: null, roomCode: null, players: [], hostUuid: null }),
}))
