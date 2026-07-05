import { create } from 'zustand'

/**
 * 매칭 큐·방 상태를 전역으로 관리합니다.
 * match_found → setRoom → GameMatchingPage가 store를 읽어 렌더링합니다.
 *
 * Zustand는 useState처럼 컴포넌트 안에 값을 두는 대신, 컴포넌트 트리 밖에
 * "전역 상태 저장소"를 하나 만들어 여러 컴포넌트가 함께 구독하도록 해주는
 * 상태 관리 라이브러리입니다. create()가 반환하는 useMatchingStore가 그
 * 저장소를 사용하기 위한 훅입니다. (기본 개념은 auth/store/authStore.js 참고)
 *
 * 이 스토어가 제공하는 것:
 * - state: isSearching(매칭 큐 대기 중인지), isInRoom(방에 입장했는지),
 *   roomId·roomCode(방 식별자·초대 코드), players(방 안 플레이어 목록),
 *   hostUuid(방장 uuid)
 * - actions: startSearch/stopSearch로 매칭 큐 시작·중단, setRoom으로 방 입장 시
 *   전체 데이터 세팅, addPlayer/removePlayer로 입장·퇴장 반영, updateHost로
 *   방장 변경 반영, clearRoom으로 방 관련 state 초기화
 *
 * useMatchingStore()처럼 인자 없이 호출하면 스토어 전체를 구독하고,
 * useMatchingStore((s) => s.roomId)처럼 selector 함수를 넘기면 그 값이 바뀔
 * 때만 컴포넌트가 리렌더링됩니다 (예: hooks/useMatchingRoom.js의 roomId 구독).
 */
export const useMatchingStore = create((set) => ({
  isSearching: false, // 매칭 큐에서 상대를 찾는 중인지 여부
  isInRoom: false,     // 방에 입장해 있는지 여부
  roomId: null,        // 현재 입장한 방의 서버측 식별자
  roomCode: null,       // 초대용 방 코드 (RoomCodeViewModal에서 표시·복사)
  players: [],      // { uuid, nickname }[]  — 현재 방에 있는 플레이어 목록
  hostUuid: null,       // 방장 플레이어의 uuid

  startSearch: () => set({ isSearching: true }),
  stopSearch:  () => set({ isSearching: false }),

  // match_found 등으로 방 입장이 확정됐을 때 방 데이터 전체를 한 번에 세팅
  setRoom: ({ roomId, roomCode, players, hostUuid }) =>
    set({ isSearching: false, isInRoom: true, roomId, roomCode, players, hostUuid }),

  // player_joined_room 이벤트 수신 시 players 배열에 새 플레이어 추가
  addPlayer: (player) =>
    set((s) => ({ players: [...s.players, player] })),

  // player_left_room 이벤트 수신 시 players 배열에서 해당 uuid 제거
  removePlayer: (uuid) =>
    set((s) => ({ players: s.players.filter((p) => p.uuid !== uuid) })),

  // host_changed 이벤트 수신 시 방장 uuid 갱신
  updateHost: (hostUuid) => set({ hostUuid }),

  // 방 나가기·삭제·게임 시작 시 방 관련 state를 초기 상태로 되돌림
  clearRoom: () =>
    set({ isInRoom: false, roomId: null, roomCode: null, players: [], hostUuid: null }),
}))
