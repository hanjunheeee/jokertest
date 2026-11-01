// 방 목록 소켓 이벤트 이름·기다리는 시간
// socket/rooms·usePublicRooms가 씀, 시험도 이 이름 씀
export const ROOM_LIST_SOCKET_EVENTS = {
  GET_PUBLIC_ROOMS: "get_public_rooms",
  PUBLIC_ROOMS_UPDATED: "public_rooms_updated",
  JOIN_PUBLIC_ROOM: "join_public_room",
  ROOM_JOINED: "room_joined",
  ROOM_JOIN_FAILED: "room_join_failed",
}

// 목록 묻기 응답 기다리는 시간
export const PUBLIC_ROOM_LIST_TIMEOUT_MS = 5000

// 공개 방 들어가기 결과 방송 기다리는 시간 (넘으면 다시 누를 수 있음)
export const PUBLIC_ROOM_JOIN_TIMEOUT_MS = 8000
