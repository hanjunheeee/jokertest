import { create } from 'zustand'

export function selectRoomMembershipId(state, uuid) {
    if (typeof uuid !== 'string' || uuid.length === 0) return null
    const seated = (state?.players ?? []).find((player) => player?.uuid === uuid)
    const membershipId = seated?.membershipId
    return typeof membershipId === 'string' && membershipId.length > 0 ? membershipId : null
}

export function isCurrentRoomKickEvent(state, payload) {
    if (payload === null || typeof payload !== 'object') return false
    if (!state?.isInRoom) return false
    if (typeof payload.roomId !== 'string' || payload.roomId !== state.roomId) return false
    if (typeof payload.roomInstanceId !== 'string' || payload.roomInstanceId !== state.roomInstanceId) return false
    if (typeof payload.bootEpoch !== 'string' || payload.bootEpoch !== state.bootEpoch) return false
    const mine = selectRoomMembershipId(state, payload.targetUuid)
    if (mine === null) return false
    return payload.targetMembershipId === mine
}

export const useMatchingStore = create((set) => ({
    isSearching: false,

    isInRoom: false,

    roomId: null,

    roomCode: null,

    players: [],

    hostUuid: null,

    roomInstanceId: null,
    bootEpoch: null,

    canStart: false,

    accessType: null,
    settings: null,
    settingsVersion: null,

    roomRevision: 0,

    startSearch: () => set({ isSearching: true}),
    stopSearch: () => set({isSearching: false}),

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

    addPlayer: (player, canStart) =>
        set((s) => ({
            players: [...s.players, player],
            canStart: canStart ?? s.canStart,
            roomRevision: s.roomRevision + 1,
        })),

    removePlayer: (uuid, canStart) =>
        set((s) => ({
            players: s.players.filter((p) => p.uuid !== uuid),
            canStart: canStart ?? s.canStart,
            roomRevision: s.roomRevision + 1,
        })),

    updateHost: (hostUuid, canStart) =>
        set((s) => ({ hostUuid, canStart: canStart ?? s.canStart, roomRevision: s.roomRevision + 1 })),

    setPlayerReady: (uuid, isReady, canStart, readyRevision) =>
        set((s) => ({
            players: s.players.map((p) => (p.uuid === uuid
                ? { ...p, isReady, ...(Number.isInteger(readyRevision) ? { readyRevision } : {}) }
                : p)),
            canStart: canStart ?? s.canStart,
            roomRevision: s.roomRevision + 1,
        })),

    clearRoom: () =>
        set((s) => ({
            isSearching: false, isInRoom: false, roomId: null, roomCode: null, players: [], hostUuid: null,
            canStart: false,
            roomInstanceId: null, bootEpoch: null,
            accessType: null, settings: null, settingsVersion: null,
            roomRevision: s.roomRevision + 1,
        })),
}))
