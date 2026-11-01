// 소켓 받기 공통 손잡이와 연결·끊김 받기
// socket/ 안 파일들이 on/off 짝을 맞출 때, 인게임 훅들이 다시 연결·끊김을 감지할 때 사용

// 받기 등록하고, 같은 손잡이로 끄는 함수 돌려줌
export function listen(socket, event, fn) {
  socket.on(event, fn)
  return () => socket.off(event, fn)
}

// 다시 연결됐을 때 받기
export const onConnect = (socket, fn) => listen(socket, "connect", fn)

// 연결 끊겼을 때 받기
export const onDisconnect = (socket, fn) => listen(socket, "disconnect", fn)
