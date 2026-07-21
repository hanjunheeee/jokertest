/** create_room / get_current_room에서 쓰는 소켓 이벤트 이름입니다. */
export const SOCKET_EVENTS = {
  CREATE_ROOM: "create_room",
  GET_CURRENT_ROOM: "get_current_room",
}

// 서버 ack가 이 시간 안에 오지 않으면 socket.io가 타임아웃 에러를 던진다.
export const CREATE_ROOM_TIMEOUT_MS = 8000
export const CURRENT_ROOM_TIMEOUT_MS = 5000

// ack 유실 후 get_current_room으로 복구를 시도할 때의 재조회 간격/최대 횟수입니다.
// 서버가 pending:true(아직 처리 중)를 내려줄 때만 재조회하며, 무한 polling은 하지 않습니다.
export const CURRENT_ROOM_POLL_INTERVAL_MS = 700
export const CURRENT_ROOM_MAX_POLL_ATTEMPTS = 4

export const CREATE_ROOM_ERROR_MESSAGES = {
  NETWORK: "네트워크 상태를 확인한 뒤 다시 시도해주세요.",
}
