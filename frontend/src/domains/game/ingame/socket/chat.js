// 채팅 소켓: 낮·죽은 사람·조커 채팅 받기, 채팅 보내기
// 채팅 받기 유틸과 채팅 세션 훅이 사용
import { listen } from "./connection.js"

// 채널별 채팅 받기 (사건 이름은 부르는 쪽이 채널로 고름)
export const onChat = (socket, event, fn) => listen(socket, event, fn)

// 조커 채팅 받기
export const onJokerChat = (socket, fn) => listen(socket, "joker_chat_message", fn)

// 낮·죽은 사람 채팅 보내기 (응답 기다림)
export function emitGameChat(socket, ms, gameId, text) {
  return socket.timeout(ms).emitWithAck("submit_game_chat_message", { gameId, text })
}

// 조커 채팅 보내기 (응답 기다림)
export function emitJokerChat(socket, ms, gameId, text) {
  return socket.timeout(ms).emitWithAck("submit_joker_chat_message", { gameId, text })
}
