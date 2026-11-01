// 지금 연결된 공용 소켓 하나를 들고, 바뀌면 구독자에게 알림
// useSocket이 넣고 빼며, 영역 socket·훅·스토어와 useSfxRuntime이 꺼내 씀
// 앱 전체에 소켓 하나, 로그아웃·연결 전엔 null
let _socket = null

// 소켓이 바뀌면 다시 그릴 구독자
const listeners = new Set()

// useSyncExternalStore 읽기용
export const getSocket = () => _socket

// 같은 소켓이면 안 알림 (괜히 다시 그리기 막기)
export const setSocket = (s) => {
  if (s === _socket) return
  _socket = s
  listeners.forEach((listener) => listener())
}

// useSyncExternalStore 구독용, 끄는 함수 돌려줌
export const subscribeSocket = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
