// 대기방 요청 대기 시간·재시도 상수
// matching/socket과 hooks/room이 씀

// 요청 응답 기다리는 시간
export const START_TIMEOUT_MS = 8000
export const READY_TIMEOUT_MS = 5000
export const CHECK_TIMEOUT_MS = 5000

// 서버가 방을 아직 만드는 중(pending)일 때 다시 묻는 간격·횟수
export const PENDING_RETRY_MS = 700
export const PENDING_MAX_RETRIES = 3

// 클라에는 방이 있는데 서버가 아직 room:null인 경우 (방 만든 직후 등) 다시 묻기
export const EMPTY_ROOM_RETRY_MS = 350
export const EMPTY_ROOM_MAX_RETRIES = 8

// 방 만든 직후 서버 get_current_room이 잠깐 비어도 목록으로 안 보냄 (ms)
export const LOCAL_ROOM_TRUST_MS = 20000

// 방 나가기·삭제 직후 서버가 잠깐 옛 방을 돌려줘도 목록 복구(대기방 재이동) 안 함 (ms)
export const ROOM_RECOVER_SUPPRESS_MS = 8000

// 방 확인 실패 뒤 조용히 다시 확인하는 간격
export const FAILED_RECHECK_MS = 5000

// 소켓 끊김 후에도 로컬에만 방이 남아 있을 때 로비로 보내기 전 대기 (서버 유예 15초 + 여유)
export const MATCHING_DISCONNECT_EXIT_MS = 20_000

// 판 끝난 뒤 파티 방 묻는 간격·응답 기다리는 시간
export const PARTY_POLL_MS = 2500
export const PARTY_POLL_TIMEOUT_MS = 5000
// 파티 방 기다리는 최대 시간 (방장이 결과 화면에 오래 머물러도 넉넉하게 3분)
export const PARTY_WAIT_MAX_MS = 180000
