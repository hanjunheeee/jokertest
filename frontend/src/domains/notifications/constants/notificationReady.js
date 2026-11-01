// 알림 ready 보내기 응답 기다림·재시도 한도
// ready 동기화(readySync.js)가 씀, 알림 소켓 훅은 시험용으로 다시 내보냄
export const READY_ACK_TIMEOUT_MS = 5000
export const READY_MAX_ATTEMPTS = 3
