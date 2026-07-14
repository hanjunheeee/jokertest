// 컴포넌트 밖에서도 같은 socket 인스턴스를 꺼내 쓰기 위한 모듈 싱글턴입니다.
// useSocket 훅에서 만든 socket을 여기에 한 번 저장해두면, 다른 파일에서도 getSocket()으로 가져다 쓸 수 있습니다.
let _socket = null

// 현재 저장된 socket 인스턴스를 반환합니다.
// 아직 setSocket이 호출되지 않았다면 null이 나올 수 있습니다.
export const getSocket = () => _socket

// 앱 시작 시 useSocket 같은 초기화 코드에서 실제 socket 인스턴스를 저장합니다.
// 이렇게 해두면 props로 계속 내려보내지 않아도 필요한 곳에서 socket.emit(...)을 사용할 수 있습니다.
export const setSocket = (s) => { _socket = s }
