// 모바일 일반 가입 단계 (계정 → 이메일 인증 → 프로필), 화면만 나눔
// pages/LoginPage.jsx가 씀, 입력값·검사·제출은 데스크톱 useLoginPage 그대로라 단계는 보이는 칸만 바꿈
import { useState } from "react"

// 단계 이름 (위 단계 표시 글자)
export const SIGNUP_STEPS = ["계정", "이메일 인증", "프로필"]

const LAST_STEP = SIGNUP_STEPS.length - 1

// 단계 사이를 자유롭게 오감 (검사는 마지막 가입 버튼에서 데스크톱 순서대로 함)
export function useSignupSteps() {
  const [step, setStep] = useState(0)

  // 범위 밖 값은 끝으로 붙임
  const goTo = (next) => setStep(Math.min(LAST_STEP, Math.max(0, next)))

  return {
    step,
    isLastStep: step === LAST_STEP,
    goTo,
    next: () => goTo(step + 1),
    prev: () => goTo(step - 1),
    reset: () => setStep(0),
  }
}
