// 추방 요청 진행 상태 이름과 응답 기한
// 추방 요청 훅(useKickPlayerRequest)·결과 조회(hooks/kick/)·추방 소켓·추방 창 내용이 사용

export const KICK_REQUEST_STATUS = Object.freeze({
  IDLE: "IDLE",
  CONFIRMING: "CONFIRMING",
  SENDING: "SENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
})

// 추방 요청·결과 조회·소속 다시 확인 응답 기한
export const KICK_ACK_TIMEOUT_MS = 8000

// 기한 안에 응답이 없을 때 넘기는 답 (결과를 모르는 것이라 성공·실패로 정하지 않음)
export const KICK_NO_RESPONSE = Object.freeze({ ok: false, code: "NO_RESPONSE", timedOut: true })

// 결과 모름 뒤 소속 다시 확인이 실패했을 때 보이는 코드
export const KICK_VERIFY_FAILED_CODE = "VERIFY_FAILED"
