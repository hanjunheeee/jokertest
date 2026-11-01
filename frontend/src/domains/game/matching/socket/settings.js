// 대기방 설정 저장 요청·저장 결과 묻기
// hooks/room/useSettingsSave가 씀
import {
  ROOM_SETTINGS_RESULT_TIMEOUT_MS,
  SOCKET_EVENTS,
  UPDATE_ROOM_SETTINGS_TIMEOUT_MS,
} from '@/domains/game/setup/constants/gameSetupSocket.js'

// 설정 저장 요청
export const sendSettings = (socket, payload) =>
  socket.timeout(UPDATE_ROOM_SETTINGS_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, payload)

// 응답 못 받은 저장 요청이 결국 됐는지 묻기 (pending = { roomId, requestId })
export const askSettingsResult = (socket, pending) =>
  socket.timeout(ROOM_SETTINGS_RESULT_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, pending)
