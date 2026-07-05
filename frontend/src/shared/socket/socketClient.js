/**
 * useSocket 훅 밖의 컴포넌트가 emit할 수 있도록 소켓 인스턴스를 모듈 레벨에서 공유합니다.
 * useSocket 내부에서만 set/clear — 외부에서는 getSocket()?.emit(...) 형태로만 사용합니다.
 *
 * 모듈 최상위 변수(_socket)는 이 파일이 한 번만 로드되어 앱 전체에서 공유되는 특성을 이용한
 * 간단한 싱글턴 저장소입니다. React state가 아니므로 값이 바뀌어도 리렌더링을 유발하지 않습니다.
 */
let _socket = null

/** 현재 연결된 소켓 인스턴스를 반환 (연결 전이거나 로그아웃 상태면 null) */
export const getSocket = () => _socket
/** useSocket 훅이 연결을 맺거나 끊을 때 소켓 인스턴스를 등록/해제하기 위해 호출 (s: 소켓 인스턴스 또는 null) */
export const setSocket = (s) => { _socket = s }
