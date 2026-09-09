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

    // 서버가 계산해 내려준, 지금 게임을 시작할 수 있는 상태인지 여부입니다. 프런트는 이 값을
    // 그대로 표시만 하고 별도로 재계산하지 않습니다(서버가 유일한 진실).
    canStart: false,

    startSearch: () => set({ isSearching: true}),
    stopSearch: () => set({isSearching: false}),

    setRoom: ({ roomId, roomCode, players, hostUuid, canStart = false }) =>
        set({ isSearching: false, isInRoom: true, roomId, roomCode, players, hostUuid, canStart }),

    // canStart는 참가 시점 서버 계산값을 그대로 반영합니다(생략 시 기존 값 유지).
    addPlayer: (player, canStart) =>
        set((s) => ({
            players: [...s.players, player],
            canStart: canStart ?? s.canStart,
        })),

    removePlayer: (uuid, canStart) =>
        set((s) => ({
            players: s.players.filter((p) => p.uuid !== uuid),
            canStart: canStart ?? s.canStart,
        })),

    updateHost: (hostUuid, canStart) =>
        set((s) => ({ hostUuid, canStart: canStart ?? s.canStart })),

    // set_ready ack(본인)와 player_ready_changed(다른 참가자) 양쪽에서 함께 쓰는 갱신 함수입니다.
    setPlayerReady: (uuid, isReady, canStart) =>
        set((s) => ({
            players: s.players.map((p) => (p.uuid === uuid ? { ...p, isReady } : p)),
            canStart: canStart ?? s.canStart,
        })),

    clearRoom: () =>
        set({ isSearching: false, isInRoom: false, roomId: null, roomCode: null, players: [], hostUuid: null, canStart: false }),
}))
