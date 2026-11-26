// 방 목록·방 들어가기: 목록 묻기·공개 방 들어가기 보내기, 목록 갱신·입장 결과 받기
// hooks/usePublicRooms·hooks/useRoomInvitePage가 씀
import {
  PUBLIC_ROOM_LIST_TIMEOUT_MS,
  ROOM_LIST_SOCKET_EVENTS,
} from "../constants/roomListSocket.js"

// 연결돼 있으면 바로 보내고, 미연결(connected === false)이면 connect 뒤 한 번만 보냄 (취소 함수 돌려줌)
// 미연결일 때 바로 emit하면 sendBuffer에 쌓여 8초 제한 시간 뒤 유령 입장이 나가는 것을 막음
function emitWhenConnected(socket, send) {
  if (socket.connected !== false || typeof socket.on !== "function") {
    send()
    return () => {}
  }
  const handleConnect = () => {
    if (typeof socket.off === "function") socket.off("connect", handleConnect)
    send()
  }
  socket.on("connect", handleConnect)
  return () => {
    if (typeof socket.off === "function") socket.off("connect", handleConnect)
  }
}

// 공개 방 목록 묻기
export const askRooms = (socket) =>
  socket.timeout(PUBLIC_ROOM_LIST_TIMEOUT_MS).emitWithAck(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS, {})

// 공개 방 들어가기 (미연결이면 붙은 뒤 보내고 취소 함수를 돌려줌)
export const joinPublic = (socket, roomId) =>
  emitWhenConnected(socket, () => socket.emit(ROOM_LIST_SOCKET_EVENTS.JOIN_PUBLIC_ROOM, { roomId }))

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

// 방 코드로 들어가기 (미연결이면 붙은 뒤 보내고 취소 함수를 돌려줌)
export const joinByCode = (socket, payload) =>
  emitWhenConnected(socket, () => socket.emit("join_room_by_code", payload))

// 방 코드 입장 성공·실패 받기, 끊는 함수 돌려줌
export function onJoinResult(socket, { joined, failed }) {
  socket.on("room_joined", joined)
  socket.on("room_join_failed", failed)
  return () => {
    socket.off("room_joined", joined)
    socket.off("room_join_failed", failed)
  }
}
