// 공용 소켓 연결 이벤트 이름·서버 점검 안내 글
// shared/socket/connection.js·useSocket이 씀, 시험도 이 이름 씀
export const CONNECTION_SOCKET_EVENTS = {
  FORCE_DISCONNECT: "force_disconnect",
  SERVER_SHUTDOWN: "server_shutdown",
}

// 서버가 꺼지기 직전 보내는 안내 (backend utils/processLifecycle.js), 끊긴 뒤 다시 연결은 socket.io가 알아서 함
export const SERVER_SHUTDOWN_NOTICE = "서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요."
