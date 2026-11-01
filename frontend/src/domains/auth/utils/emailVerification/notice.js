// 가입 이메일 인증 칸의 받기 버튼 글자·안내 줄 고르기
// components/SignupEmailVerification.jsx가 사용
import {
  SIGNUP_EMAIL_VERIFICATION_NOTICE_ERROR_CLASS,
  SIGNUP_EMAIL_VERIFICATION_NOTICE_INFO_CLASS,
  SIGNUP_EMAIL_VERIFICATION_NOTICE_SUCCESS_CLASS,
} from "../../constants/signupLayoutStyle.js"

// 받기 버튼 글자: 보내는 중 / 처음 / 재발송 대기 초 / 재발송
export function sendButtonLabel(stage, resendRemainingSec) {
  if (stage === "sending") return "발송 중..."
  if (stage === "unverified") return "인증번호 받기"
  if (resendRemainingSec > 0) return `재발송 (${resendRemainingSec}초)`
  return "재발송"
}

// 안내 줄 하나만: 완료 > 에러 문구 > 남은 시간 순서, 셋 다 아니면 null
export function pickNotice({ isVerified, stage, message, codeRemainingSec }) {
  if (isVerified) {
    return {
      className: SIGNUP_EMAIL_VERIFICATION_NOTICE_SUCCESS_CLASS,
      text: "이메일 인증이 완료되었습니다.",
    }
  }
  if (message) {
    return { className: SIGNUP_EMAIL_VERIFICATION_NOTICE_ERROR_CLASS, text: message }
  }
  if (stage === "codeSent" && codeRemainingSec !== null) {
    return {
      className: SIGNUP_EMAIL_VERIFICATION_NOTICE_INFO_CLASS,
      text: `남은 시간 ${codeRemainingSec}초`,
    }
  }
  return null
}
