// 대기방 요청 보내기 전 도우미: 보낼 수 있는지 보기·설정 저장 요청 id 만들기
// hooks/room의 요청 훅들이 씀

// 지금 소켓으로 요청을 보낼 수 있는지 (소켓 있음·연결됨·브라우저 온라인)
export const canSend = (socket) => Boolean(socket) && socket.connected && window.navigator.onLine

// 서버가 같은 저장 요청인지 알아보는 id, crypto 없으면 시간+난수로 대신함
export const newRequestId = () => {
  const random = globalThis.crypto?.randomUUID?.()
  return random ?? `rs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
