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

    // 마지막으로 알던 방장 uuid입니다. clearRoom이 비우지 않는 유일한 방 정보로,
    // game_started 직후 useMatchingRoom이 clearRoom을 부른 뒤에도 인게임 설정의 방관리
    // 탭이 방장 여부를 판단할 수 있게 남겨둡니다(useInGameSettingIsHost 참고).
    // 서버 GameSession payload에 hostUuid가 실리면 이 값 대신 그쪽을 씁니다.
    lastHostUuid: null,

    // 서버가 계산해 내려준, 지금 게임을 시작할 수 있는 상태인지 여부입니다. 프런트는 이 값을
    // 그대로 표시만 하고 별도로 재계산하지 않습니다(서버가 유일한 진실).
    canStart: false,

    startSearch: () => set({ isSearching: true}),
    stopSearch: () => set({isSearching: false}),

    setRoom: ({ roomId, roomCode, players, hostUuid, canStart = false }) =>
        set({ isSearching: false, isInRoom: true, roomId, roomCode, players, hostUuid, lastHostUuid: hostUuid ?? null, canStart }),

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
        set((s) => ({ hostUuid, lastHostUuid: hostUuid ?? s.lastHostUuid, canStart: canStart ?? s.canStart })),

    // set_ready ack(본인)와 player_ready_changed(다른 참가자) 양쪽에서 함께 쓰는 갱신 함수입니다.
    setPlayerReady: (uuid, isReady, canStart) =>
        set((s) => ({
            players: s.players.map((p) => (p.uuid === uuid ? { ...p, isReady } : p)),
            canStart: canStart ?? s.canStart,
        })),

    // lastHostUuid는 일부러 비우지 않습니다 — game_started 직후 이 함수가 방 상태를 지운 뒤에도
    // 인게임이 방장 정보를 읽어야 하기 때문입니다(위 lastHostUuid 주석 참고).
    clearRoom: () =>
        set({ isSearching: false, isInRoom: false, roomId: null, roomCode: null, players: [], hostUuid: null, canStart: false }),
}))
