// 판 끝난 뒤 파티 방 다시 들어가기: 보내기·받기
// hooks/room/usePartyRejoin이 씀
import { SOCKET_EVENTS } from '@/domains/game/shared/constants/gameSetupSocket.js'
import { PARTY_POLL_TIMEOUT_MS } from '../constants/roomTiming.js'

// 방 코드로 들어가기 요청
export const joinByCode = (socket, payload) => socket.emit('join_room_by_code', payload)

// 방장이 새로 만든 파티 방 묻기
export const askPartyRoom = (socket, payload) =>
  socket.timeout(PARTY_POLL_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GET_PARTY_MATCHING_ROOM, payload)

// 들어가기 성공·실패, 파티 방 준비됨 이벤트 받기, 끊는 함수 돌려줌
export function onParty(socket, { joined, joinFailed, ready }) {
  socket.on('room_joined', joined)
  socket.on('room_join_failed', joinFailed)
  socket.on('party_matching_room_ready', ready)
  return () => {
    socket.off('room_joined', joined)
    socket.off('room_join_failed', joinFailed)
    socket.off('party_matching_room_ready', ready)
  }
}
