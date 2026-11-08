// 낮 투표 판정 요청 고정 값: 응답 시간·실패 문구
// 낮 투표 판정 요청 훅(useDayVoteResolve)과 utils/dayVoteResolve.js가 사용

// 판정 응답 기다리는 시간
export const TIMEOUT_MS = 5000

// 서버가 실패 문구를 안 줬을 때
export const FAILED_MSG = "판정하지 못했습니다."

// 보낼 때 연결이 없을 때
export const OFFLINE_MSG = "서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요."

// 응답이 시간 안에 안 올 때
export const NO_ACK_MSG = "요청이 응답하지 않습니다. 다시 시도해주세요."
