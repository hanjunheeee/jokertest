export const SOCKET_EVENTS = {
  CREATE_ROOM: "create_room",
  GET_CURRENT_ROOM: "get_current_room",
  GET_PARTY_MATCHING_ROOM: "get_party_matching_room",
  UPDATE_ROOM_SETTINGS: "update_room_settings",
  GET_ROOM_SETTINGS_UPDATE_RESULT: "get_room_settings_update_result",
  ROOM_SETTINGS_UPDATED: "room_settings_updated",
}

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

export const UPDATE_ROOM_SETTINGS_TIMEOUT_MS = 8000
export const ROOM_SETTINGS_RESULT_TIMEOUT_MS = 5000

export const ROOM_SETTINGS_ERROR_MESSAGES = {
  NETWORK: "설정을 저장하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.",
  RESULT_UNKNOWN: "저장 결과를 확인하지 못했습니다. 최신 설정을 불러온 뒤 다시 시도해주세요.",
  RESULT_UNRESOLVED:
    "방 설정이 저장됐는지 확인하지 못했습니다. 지금 방 설정을 확인하고, 원하는 값과 다르면 다시 저장해주세요.",
}

export const CREATE_ROOM_TIMEOUT_MS = 8000
export const CURRENT_ROOM_TIMEOUT_MS = 5000

export const CURRENT_ROOM_POLL_INTERVAL_MS = 700
export const CURRENT_ROOM_MAX_POLL_ATTEMPTS = 4

export const CREATE_ROOM_ERROR_MESSAGES = {
  NETWORK: "네트워크 상태를 확인한 뒤 다시 시도해주세요.",
}
