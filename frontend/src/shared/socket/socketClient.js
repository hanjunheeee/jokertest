// 컴포넌트 밖에서도 같은 socket 인스턴스를 꺼내 쓰기 위한 모듈 싱글턴입니다.
// useSocket 훅에서 만든 socket을 여기에 한 번 저장해두면, 다른 파일에서도 getSocket()으로 가져다 쓸 수 있습니다.
let _socket = null

// socket 참조가 바뀔 때(생성/교체/해제) 알림을 받을 구독자 목록입니다. 이 모듈은 socket
// 참조 자체만 다루고 어떤 도메인(예: matching)의 상태도 알지 못합니다 — 도메인 지식 없는
// 범용 pub/sub만 제공합니다.
const listeners = new Set()

// 현재 저장된 socket 인스턴스를 반환합니다.
// 아직 setSocket이 호출되지 않았다면 null이 나올 수 있습니다.
// React의 useSyncExternalStore에 getSnapshot/getServerSnapshot으로 그대로 넘겨도 안전합니다 —
// 실제 참조가 바뀔 때만 값이 달라지는 안정적인 스냅숏이기 때문입니다.
export const getSocket = () => _socket

// 앱 시작 시 useSocket 같은 초기화 코드에서 실제 socket 인스턴스를 저장합니다.
// 이렇게 해두면 props로 계속 내려보내지 않아도 필요한 곳에서 socket.emit(...)을 사용할 수 있습니다.
// 같은 참조로 다시 설정하면(예: 방어적 재호출) 구독자에게 알리지 않습니다 — 불필요한 리렌더를 막기 위함입니다.
export const setSocket = (s) => {
  if (s === _socket) return
  _socket = s
  listeners.forEach((listener) => listener())
}

// socket 참조가 바뀔 때마다(생성/교체/해제) listener를 호출합니다. cleanup용 unsubscribe
// 함수를 반환합니다 — useSyncExternalStore의 subscribe 인자로 바로 사용할 수 있는 형태입니다.
export const subscribeSocket = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
