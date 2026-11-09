// 공용 소켓 연결 이벤트 이름·서버 점검 안내 글·Node 이동 약속(코드·시간·안내 글)
// shared/socket/connection.js·nodeMove.js·nodeHint.js·useSocket·방 입장 훅이 씀, 시험도 이 이름 씀
export const CONNECTION_SOCKET_EVENTS = {
  FORCE_DISCONNECT: "force_disconnect",
  SERVER_SHUTDOWN: "server_shutdown",
}

// 서버가 꺼지기 직전 보내는 안내 (backend utils/processLifecycle.js), 끊긴 뒤 다시 연결은 socket.io가 알아서 함
export const SERVER_SHUTDOWN_NOTICE = "서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요."

// Node 여러 개일 때 서버가 주는 코드 (계획 4-5, 서버 단일 모드는 안 보냄)
// WRONG_NODE: 접속 거절(connect_error), data.node로 가야 함
// ROOM_ON_OTHER_NODE: 입장·초대 수락·다음 방 묻기 거절, node로 옮긴 뒤 한 번 다시
export const NODE_ERROR_CODES = {
  WRONG_NODE: "WRONG_NODE",
  ROOM_ON_OTHER_NODE: "ROOM_ON_OTHER_NODE",
  NODE_UNAVAILABLE: "NODE_UNAVAILABLE",
  CLUSTER_UNAVAILABLE: "CLUSTER_UNAVAILABLE",
}

// 다른 Node로 옮겨 다시 붙기 기다리는 시간
export const NODE_MOVE_TIMEOUT_MS = 10000

// WRONG_NODE 튕김 한도: 30초에 3번 넘으면 힌트 버리고 아무 Node로 (고리 막기)
export const NODE_BOUNCE_LIMIT = 3
export const NODE_BOUNCE_WINDOW_MS = 30000

// 한도 넘은 뒤에도 계속 튕기면 이만큼 쉬었다 다시 붙음 (빠른 고리 막기)
export const NODE_BOUNCE_RETRY_MS = 5000

// 이동 실패 안내 (서버 글이 없을 때)
export const NODE_MOVE_MESSAGES = {
  NODE_UNAVAILABLE: "방을 찾을 수 없습니다. 잠시 후 다시 시도해주세요.",
  CLUSTER_UNAVAILABLE: "지금은 방 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.",
  ROOM_ON_OTHER_NODE: "방이 있는 서버로 옮기지 못했습니다. 잠시 후 다시 시도해주세요.",
}
