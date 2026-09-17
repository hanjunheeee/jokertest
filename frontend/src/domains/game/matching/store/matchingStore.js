import { create } from 'zustand'

/**
 * F-21(AC-02/AC-05/AC-06): 지금 이 화면이 들고 있는 방에서 **그 계정의 현재 소속 식별자**.
 *
 * 추방 요청(요청자 소속)과 개인 퇴장 사건(대상 소속) 양쪽이 같은 근거를 써야 한다 — 한쪽만
 * uuid로 판정하면 나갔다 다시 들어온 같은 계정의 새 소속이 옛 사실로 지워진다. 서버가 아직
 * 소속을 싣지 않는 경우(구버전 응답)에는 null이고, 호출부가 그 상태를 "보낼 수 없음"으로 다룬다.
 */
export function selectRoomMembershipId(state, uuid) {
    if (typeof uuid !== 'string' || uuid.length === 0) return null
    const seated = (state?.players ?? []).find((player) => player?.uuid === uuid)
    const membershipId = seated?.membershipId
    return typeof membershipId === 'string' && membershipId.length > 0 ? membershipId : null
}

/**
 * F-21(AC-02/AC-05/AC-06): 개인 퇴장 사건(room_kicked)이 **지금 이 화면이 들고 있는 바로 그
 * 소속**을 가리키는지 판정한다(순수 함수 — 어떤 상태도 바꾸지 않는다).
 *
 * 네 가지가 전부 맞아야 한다: 같은 방 · 같은 방 인스턴스 · 같은 서버 기동 · 같은 소속.
 * 하나라도 빠지면 다음이 통과한다 — 같은 방에 다시 들어온 뒤 도착한 옛 사건(소속이 다름),
 * R1→R2 이동 뒤의 옛 사건(방이 다름), 재시작 전 명령(기동이 다름), 같은 roomId로 다시 만들어진
 * 방(인스턴스가 다름). 서버는 이 네 값을 제거 **전에** 캡처해 싣는다.
 */
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

    // F-21(AC-02/AC-05/AC-06): 서버가 준 **방 인스턴스**와 **프로세스 기동** 식별자입니다.
    // 둘 다 buildRoomPayload가 모든 방 응답에 싣는 값이고, 프런트는 그대로 보관만 합니다.
    //
    // roomId만으로는 부족합니다. 같은 roomId가 재사용되거나(나갔다 다시 들어옴) 서버가 재시작된
    // 뒤 도착한 옛 room_kicked 사건이 "내 방 맞다"로 통과해 방금 성립한 새 소속을 지웁니다.
    // 추방 요청도 이 두 값을 그대로 되돌려보내야 서버가 "그 방의 그 판"임을 확인할 수 있습니다.
    roomInstanceId: null,
    bootEpoch: null,

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

    // 서버 방 응답(buildRoomPayload) 하나를 통째로 받는 **유일한** 적재 경로입니다. 생성·입장·
    // 현재 방 조회·재연결 복원이 전부 여기로 들어오므로, 서버가 싣는 식별자를 여기서 버리면
    // 어느 경로로 들어와도 화면이 그 값을 갖지 못합니다(roomInstanceId/bootEpoch 참고).
    setRoom: ({
        roomId, roomCode, players, hostUuid, canStart = false,
        accessType = null, settings = null, settingsVersion = null,
        roomInstanceId = null, bootEpoch = null,
    }) =>
        set({
            isSearching: false, isInRoom: true, roomId, roomCode, players, hostUuid, canStart,
            accessType, settings, settingsVersion, roomInstanceId, bootEpoch,
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
            // 방 식별자도 함께 지운다 — 남으면 다음 방의 사건·요청이 이전 방의 인스턴스를
            // 근거로 통과할 수 있다(추방 사건 판정의 입력이다).
            roomInstanceId: null, bootEpoch: null,
            // 설정도 반드시 함께 지운다 — 남으면 계정 전환·방 이동 뒤에 이전 방의 설정이
            // 새 편집 화면의 시작점으로 되살아난다(AC-05).
            accessType: null, settings: null, settingsVersion: null,
        }),
}))
