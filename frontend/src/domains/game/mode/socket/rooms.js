// 방 목록·방 들어가기: 목록 묻기·공개 방 들어가기 보내기, 목록 갱신·입장 결과 받기
// hooks/usePublicRooms·hooks/useRoomInvitePage가 씀
import {
  PUBLIC_ROOM_LIST_TIMEOUT_MS,
  ROOM_LIST_SOCKET_EVENTS,
} from "../constants/roomListSocket.js"

// 공개 방 목록 묻기
export const askRooms = (socket) =>
  socket.timeout(PUBLIC_ROOM_LIST_TIMEOUT_MS).emitWithAck(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS, {})

// 공개 방 들어가기 (결과는 입장 성공·실패 방송으로 옴)
export const joinPublic = (socket, roomId) =>
  socket.emit(ROOM_LIST_SOCKET_EVENTS.JOIN_PUBLIC_ROOM, { roomId })

// 목록 갱신·입장 성공·입장 실패·다시 연결 받기, 끊는 함수 돌려줌
export function onRoomList(socket, { updated, joined, joinFailed, connect }) {
  socket.on(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED, updated)
  socket.on(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED, joined)
  socket.on(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, joinFailed)
  socket.on("connect", connect)
  return () => {
    socket.off(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED, updated)
    socket.off(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED, joined)
    socket.off(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, joinFailed)
    socket.off("connect", connect)
  }
}

// 방 코드 입장 성공·실패 받기, 끊는 함수 돌려줌
// (입장 요청 보내기는 시험이 훅 원문을 확인해서 hooks/useRoomInvitePage에 남김)
export function onJoinResult(socket, { joined, failed }) {
  socket.on("room_joined", joined)
  socket.on("room_join_failed", failed)
  return () => {
    socket.off("room_joined", joined)
    socket.off("room_join_failed", failed)
  }
}
