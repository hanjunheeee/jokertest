// 알림 소켓 받기(on/off)·보내기(emit)
// 알림 소켓 훅(받기)과 ready 동기화(readySync.js, 보내기)가 씀

// 새 알림·연결·끊김 받기, 돌려준 함수로 같은 순서대로 끊음
export function subscribeNotifications(socket, { created, connect, disconnect }) {
  socket.on("notification_created", created)
  socket.on("connect", connect)
  socket.on("disconnect", disconnect)
  return () => {
    socket.off("notification_created", created)
    socket.off("connect", connect)
    socket.off("disconnect", disconnect)
  }
}

// 복원 끝났다고 서버에 알림, 응답은 onAck로 받음
export function emitNotificationsReady(socket, onAck) {
  socket.emit("notifications_ready", {}, onAck)
}
