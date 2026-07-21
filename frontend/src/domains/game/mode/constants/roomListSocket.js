export const ROOM_LIST_SOCKET_EVENTS = {
  GET_PUBLIC_ROOMS: "get_public_rooms",
  PUBLIC_ROOMS_UPDATED: "public_rooms_updated",
  JOIN_PUBLIC_ROOM: "join_public_room",
  ROOM_JOINED: "room_joined",
  ROOM_JOIN_FAILED: "room_join_failed",
}

export const PUBLIC_ROOM_LIST_TIMEOUT_MS = 5000

// join_public_room은 ack를 쓰지 않고 room_joined/room_join_failed 이벤트로 응답받는다.
// 두 이벤트 모두 영영 안 올 가능성(네트워크 유실 등)에 대비해, 이 시간이 지나면
// 프런트 쪽 isJoining 상태만이라도 강제로 풀어 버튼이 영구히 비활성화되지 않게 한다.
export const PUBLIC_ROOM_JOIN_TIMEOUT_MS = 8000
