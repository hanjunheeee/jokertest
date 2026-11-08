// 알림 ready 보내기 응답 기다림·재시도 한도
// ready 동기화(readySync.js)가 씀, 알림 소켓 훅은 시험용으로 다시 내보냄
export const READY_ACK_TIMEOUT_MS = 5000
export const READY_MAX_ATTEMPTS = 3
// 실패 뒤 다시 보내기 전 기다림 (바로 다시 보내면 잠깐 끊김에 3번을 한꺼번에 써 버림)
export const READY_RETRY_DELAY_MS = 2000
