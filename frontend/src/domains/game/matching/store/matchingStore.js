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

    // F-20: 서버가 확정한 방 설정과 그 버전입니다. 프런트는 이 값을 표시·편집 시작점으로만
    // 쓰고 스스로 만들어내지 않습니다(서버가 유일한 진실). settingsVersion은 "지금 화면이
    // 보고 있는 설정이 몇 번째 확정본인가"라서, 저장 요청의 기대 버전으로 그대로 실립니다.
    accessType: null,
    settings: null,
    settingsVersion: null,

    startSearch: () => set({ isSearching: true}),
    stopSearch: () => set({isSearching: false}),

    setRoom: ({ roomId, roomCode, players, hostUuid, canStart = false, accessType = null, settings = null, settingsVersion = null }) =>
        set({
            isSearching: false, isInRoom: true, roomId, roomCode, players, hostUuid, canStart,
            accessType, settings, settingsVersion,
        }),

    /**
     * room_settings_updated 스냅샷 하나를 통째로 적용합니다.
     *
     * 설정·참가자 준비·canStart를 **한 경계에서 함께** 반영한다 — 설정만 갈아끼우면 준비
     * 표시가 한 박자 어긋나고, 전원 준비 해제가 화면에 늦게 나타난다.
     */
    applyRoomSettings: ({ settings, settingsVersion, accessType, players, canStart, hostUuid }) =>
        set((s) => ({
            accessType: accessType ?? s.accessType,
            settings: settings ?? s.settings,
            settingsVersion: settingsVersion ?? s.settingsVersion,
            players: Array.isArray(players) ? players : s.players,
            canStart: canStart ?? s.canStart,
            hostUuid: hostUuid ?? s.hostUuid,
        })),

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
    //
    // F-20(AC-04): 서버가 준 readyRevision을 함께 보관합니다. 이 값이 없으면 "지금 화면이 이미
    // 더 새로운 준비 사실을 반영했는가"를 판정할 수 없어, 늦게 도착한 옛 ACK가 최신 해제
    // 스냅샷을 되돌립니다. 서버가 싣지 않은 경우(최초 상태)에는 기존 값을 건드리지 않습니다.
    setPlayerReady: (uuid, isReady, canStart, readyRevision) =>
        set((s) => ({
            players: s.players.map((p) => (p.uuid === uuid
                ? { ...p, isReady, ...(Number.isInteger(readyRevision) ? { readyRevision } : {}) }
                : p)),
            canStart: canStart ?? s.canStart,
        })),

    clearRoom: () =>
        set({
            isSearching: false, isInRoom: false, roomId: null, roomCode: null, players: [], hostUuid: null,
            canStart: false,
            // 설정도 반드시 함께 지운다 — 남으면 계정 전환·방 이동 뒤에 이전 방의 설정이
            // 새 편집 화면의 시작점으로 되살아난다(AC-05).
            accessType: null, settings: null, settingsVersion: null,
        }),
}))
