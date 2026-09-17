/** create_room / get_current_room에서 쓰는 소켓 이벤트 이름입니다. */
export const SOCKET_EVENTS = {
  CREATE_ROOM: "create_room",
  GET_CURRENT_ROOM: "get_current_room",
  // F-20: 대기방 설정 변경. backend/utils/updateRoomSettingsValidation.js의
  // ROOM_SETTINGS_EVENTS와 같은 값이어야 한다(저장소에 공유 상수 모듈이 없어 수동 동기화하고,
  // 배선 시험이 두 목록이 갈리지 않았는지 확인한다).
  UPDATE_ROOM_SETTINGS: "update_room_settings",
  GET_ROOM_SETTINGS_UPDATE_RESULT: "get_room_settings_update_result",
  ROOM_SETTINGS_UPDATED: "room_settings_updated",
}

/**
 * F-20 설정 변경 실패 사유 코드. 서버의 ROOM_SETTINGS_ERROR_CODES와 같은 값이어야 한다.
 * 화면은 문자열을 복붙하지 않고 이 상수로만 분기한다.
 */
export const ROOM_SETTINGS_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  STALE_SOCKET: "STALE_SOCKET",
  NOT_IN_ROOM: "NOT_IN_ROOM",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  NOT_HOST: "NOT_HOST",
  ADMISSION_PENDING: "ADMISSION_PENDING",
  ALREADY_IN_GAME: "ALREADY_IN_GAME",
  SETTINGS_VERSION_CONFLICT: "SETTINGS_VERSION_CONFLICT",
  MAX_PLAYERS_BELOW_OCCUPANCY: "MAX_PLAYERS_BELOW_OCCUPANCY",
  REQUEST_ID_REUSED: "REQUEST_ID_REUSED",
  UNKNOWN: "UNKNOWN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
}

// 설정 저장 ack과 그 결과 재조회의 timeout입니다. 저장은 방 생성과 같은 성격의 쓰기 요청이라
// 같은 8초를, 결과 조회는 읽기라 현재 방 조회와 같은 5초를 씁니다.
export const UPDATE_ROOM_SETTINGS_TIMEOUT_MS = 8000
export const ROOM_SETTINGS_RESULT_TIMEOUT_MS = 5000

export const ROOM_SETTINGS_ERROR_MESSAGES = {
  NETWORK: "설정을 저장하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.",
  // ACK가 오지 않았을 때는 "실패"라고 단정하지 않는다 — 서버에는 이미 반영됐을 수 있다.
  RESULT_UNKNOWN: "저장 결과를 확인하지 못했습니다. 최신 설정을 불러온 뒤 다시 시도해주세요.",
  // 결과 확인까지 마쳤는데도 서버가 그 요청의 결과를 알려줄 수 없을 때(기록 만료·서버 재시작).
  // 성공도 실패도 단정하지 않고, 사용자가 지금 직접 할 수 있는 일만 말한다 — 내부 용어
  // (요청 식별자·기록·응답 코드)는 쓰지 않는다.
  RESULT_UNRESOLVED:
    "방 설정이 저장됐는지 확인하지 못했습니다. 지금 방 설정을 확인하고, 원하는 값과 다르면 다시 저장해주세요.",
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
