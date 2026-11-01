// 옛 경로 입구: 본체는 domains/game/shared/constants/gameSetupSocket.js로 옮김 (여러 영역이 같이 써서)
// 시험이 옛 경로로 부름, 시험 경로가 바뀌면 지움
export {
  SOCKET_EVENTS,
  ROOM_SETTINGS_ERROR_CODES,
  UPDATE_ROOM_SETTINGS_TIMEOUT_MS,
  ROOM_SETTINGS_RESULT_TIMEOUT_MS,
  ROOM_SETTINGS_ERROR_MESSAGES,
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_POLL_INTERVAL_MS,
  CURRENT_ROOM_MAX_POLL_ATTEMPTS,
  CREATE_ROOM_ERROR_MESSAGES,
} from "../../shared/constants/gameSetupSocket.js"
