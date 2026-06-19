/**
 * useSocket 훅 밖의 컴포넌트가 emit할 수 있도록 소켓 인스턴스를 모듈 레벨에서 공유합니다.
 * useSocket 내부에서만 set/clear — 외부에서는 getSocket()?.emit(...) 형태로만 사용합니다.
 */
let _socket = null

export const getSocket = () => _socket
export const setSocket = (s) => { _socket = s }
