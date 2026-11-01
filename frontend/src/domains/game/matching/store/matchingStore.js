// 대기방 상태 저장소: 지금 방·사람·방장·설정, 빠른 매칭 찾는 중 표시
// 대기방·mode·setup·result 훅, 인게임·로비 초대 수락·효과음 런타임이 씀
import { create } from 'zustand'

// 이 계정이 지금 방에 앉은 소속 id (없으면 null)
export function selectRoomMembershipId(state, uuid) {
    if (typeof uuid !== 'string' || uuid.length === 0) return null
    const seated = (state?.players ?? []).find((player) => player?.uuid === uuid)
    const membershipId = seated?.membershipId
    return typeof membershipId === 'string' && membershipId.length > 0 ? membershipId : null
}

// 받은 강퇴 이벤트가 지금 방·지금 내 소속을 가리키는지 (옛 방·옛 소속 강퇴는 무시)
export function isCurrentRoomKickEvent(state, payload) {
    if (payload === null || typeof payload !== 'object') return false
    if (!state?.isInRoom) return false
    // 방·방 인스턴스·서버 부팅 셋 다 같아야 지금 방
    if (typeof payload.roomId !== 'string' || payload.roomId !== state.roomId) return false
    if (typeof payload.roomInstanceId !== 'string' || payload.roomInstanceId !== state.roomInstanceId) return false
    if (typeof payload.bootEpoch !== 'string' || payload.bootEpoch !== state.bootEpoch) return false
    // 강퇴 대상 소속 id가 지금 앉은 소속과 같아야 함
    const mine = selectRoomMembershipId(state, payload.targetUuid)
    if (mine === null) return false
    return payload.targetMembershipId === mine
}

// 대기방 저장소 (바뀔 때마다 roomRevision 올림, 강퇴 확인이 그사이 반영 있었는지 봄)
export const useMatchingStore = create((set) => ({
    // 빠른 매칭 찾는 중 (mode/useMatchmakingSearch가 켜고 끔)
    isSearching: false,

    isInRoom: false,

    roomId: null,

    roomCode: null,

    players: [],

    hostUuid: null,

    // 같은 방 id라도 다시 만든 방·서버 재시작을 가르는 값
    roomInstanceId: null,
    bootEpoch: null,

    canStart: false,

    // 공개/코드 방, 방 설정, 설정 버전 (버전으로 옛 응답 가름)
    accessType: null,
    settings: null,
    settingsVersion: null,

    // 방 반영 횟수
    roomRevision: 0,

    // 빠른 매칭 찾기 켜기·끄기
    startSearch: () => set({ isSearching: true}),
    stopSearch: () => set({isSearching: false}),

    // 확인된 방 통째로 넣기 (안 온 값은 기본값)
    setRoom: ({
        roomId, roomCode, players, hostUuid, canStart = false,
        accessType = null, settings = null, settingsVersion = null,
        roomInstanceId = null, bootEpoch = null,
    }) =>
        set((s) => ({
            isSearching: false, isInRoom: true, roomId, roomCode, players, hostUuid, canStart,
            accessType, settings, settingsVersion, roomInstanceId, bootEpoch,
            roomRevision: s.roomRevision + 1,
        })),

    // 설정 바뀜 방송 반영: 온 값만 바꾸고 나머지는 그대로 둠
    applyRoomSettings: ({ settings, settingsVersion, accessType, players, canStart, hostUuid }) =>
        set((s) => ({
            accessType: accessType ?? s.accessType,
            settings: settings ?? s.settings,
            settingsVersion: settingsVersion ?? s.settingsVersion,
            players: Array.isArray(players) ? players : s.players,
            canStart: canStart ?? s.canStart,
            hostUuid: hostUuid ?? s.hostUuid,
            roomRevision: s.roomRevision + 1,
        })),

    // 입장한 사람 넣기
    addPlayer: (player, canStart) =>
        set((s) => ({
            players: [...s.players, player],
            canStart: canStart ?? s.canStart,
            roomRevision: s.roomRevision + 1,
        })),

    // 나간 사람 빼기
    removePlayer: (uuid, canStart) =>
        set((s) => ({
            players: s.players.filter((p) => p.uuid !== uuid),
            canStart: canStart ?? s.canStart,
            roomRevision: s.roomRevision + 1,
        })),

    // 방장 바꾸기
    updateHost: (hostUuid, canStart) =>
        set((s) => ({ hostUuid, canStart: canStart ?? s.canStart, roomRevision: s.roomRevision + 1 })),

    // 한 사람 준비 바꾸기 (준비 순번 오면 같이 저장)
    setPlayerReady: (uuid, isReady, canStart, readyRevision) =>
        set((s) => ({
            players: s.players.map((p) => (p.uuid === uuid
                ? { ...p, isReady, ...(Number.isInteger(readyRevision) ? { readyRevision } : {}) }
                : p)),
            canStart: canStart ?? s.canStart,
            roomRevision: s.roomRevision + 1,
        })),

    // 방 비우기
    clearRoom: () =>
        set((s) => ({
            isSearching: false, isInRoom: false, roomId: null, roomCode: null, players: [], hostUuid: null,
            canStart: false,
            roomInstanceId: null, bootEpoch: null,
            accessType: null, settings: null, settingsVersion: null,
            roomRevision: s.roomRevision + 1,
        })),
}))
