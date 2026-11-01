// 추방 요청 진행 상태 이름
// 추방 요청 훅(useKickPlayerRequest)과 추방 창 내용이 사용

export const KICK_REQUEST_STATUS = Object.freeze({
  IDLE: "IDLE",
  CONFIRMING: "CONFIRMING",
  SENDING: "SENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
})
