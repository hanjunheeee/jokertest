// 대기방 방송 받기: 방 안 이벤트, 소켓 연결·끊김
// hooks/room/useRoomEvents·useRoomCheck가 씀, 둘 다 끊는 함수 돌려줌
import { SOCKET_EVENTS } from '@/domains/game/shared/constants/gameSetupSocket.js'

// 방 안 이벤트: 입장·퇴장·방장 바뀜·준비·방 삭제·게임 시작·설정 바뀜
export function onRoomEvents(socket, h) {
  socket.on('player_joined_room', h.joined)
  socket.on('player_left_room', h.left)
  socket.on('host_changed', h.host)
  socket.on('player_ready_changed', h.ready)
  socket.on('room_deleted', h.deleted)
  socket.on('game_started', h.started)
  socket.on(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, h.settings)
  return () => {
    socket.off('player_joined_room', h.joined)
    socket.off('player_left_room', h.left)
    socket.off('host_changed', h.host)
    socket.off('player_ready_changed', h.ready)
    socket.off('room_deleted', h.deleted)
    socket.off('game_started', h.started)
    socket.off(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, h.settings)
  }
}

// 소켓 연결·끊김 받기
export function onConnection(socket, { connect, disconnect }) {
  socket.on('connect', connect)
  socket.on('disconnect', disconnect)
  return () => {
    socket.off('connect', connect)
    socket.off('disconnect', disconnect)
  }
}
