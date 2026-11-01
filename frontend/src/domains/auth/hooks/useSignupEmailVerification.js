// 가입 이메일 인증 상태 (받기·확인·남은 시간·가입 증명), 요청은 emailVerification 폴더가 맡음
// hooks/useLoginPage.js(일반 가입), hooks/useSocialSignup.js(소셜 가입)가 사용
import { useEffect, useRef, useState } from "react"
import { INITIAL_VERIFICATION, VERIFY_TEXT } from "../constants/emailVerification.js"
import { sendCode } from "./emailVerification/send.js"
import { verifyCode } from "./emailVerification/verify.js"

// 1초마다 다시 그릴 단계: 보냄(만료 감시)·만료·잠김(재발송 대기)
const TICKING_STAGES = new Set(["codeSent", "codeExpired", "locked"])

// active가 꺼져 있으면 받기·확인 둘 다 안 함, attemptKey가 바뀌면 인증을 처음부터
export function useSignupEmailVerification({ email = "", active = true, attemptKey = "" } = {}) {
  const [state, setState] = useState(INITIAL_VERIFICATION)

  // genRef 바뀌면 진행 중 응답 버림, inFlightRef로 요청 하나씩만, forceTick은 다시 그리기용
  const genRef = useRef(0)
  const inFlightRef = useRef(false)
  const [, forceTick] = useState(0)

  // 켜짐·시도 키·주소가 바뀌면 그린 그 자리에서 바로 처음으로 (옛 인증이 한 번도 안 보이게)
  const resetSignature = `${active ? "1" : "0"}\u0000${attemptKey ?? ""}\u0000${email}`
  const [appliedSignature, setAppliedSignature] = useState(resetSignature)
  if (appliedSignature !== resetSignature) {
    setAppliedSignature(resetSignature)
    genRef.current += 1
    setState(INITIAL_VERIFICATION)
  }

  // 화면을 나가면 진행 중 요청 응답을 버림
  useEffect(() => () => { genRef.current += 1 }, [])

  // 만료 시각이 지나면 만료로 바꾸고, 남은 초가 줄어들게 다시 그림
  useEffect(() => {
    if (!TICKING_STAGES.has(state.stage)) return undefined

    const id = setInterval(() => {
      setState((prev) => {
        if (prev.stage === "codeSent" && prev.codeExpiresAt !== null && Date.now() >= prev.codeExpiresAt) {
          return { ...prev, stage: "codeExpired", message: VERIFY_TEXT.expired }
        }
        return prev
      })
      forceTick((tick) => tick + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [state.stage])

  // 인증번호 칸 글자 그대로 저장 (검사는 확인 때)
  const handleSignupCodeChange = (e) => {
    const { value } = e.target
    setState((prev) => ({ ...prev, code: value }))
  }

  // 받기·확인은 이번에 그린 상태(current)를 보고 판단함
  const ctx = { email, active, current: state, setState, genRef, inFlightRef }
  // 인증번호 받기·재발송
  const handleRequestSignupCode = () => sendCode(ctx)
  // 인증번호 확인
  const handleVerifySignupCode = () => verifyCode(ctx)

  // 지금 칸의 주소로 받은 증명이 있을 때만 가입 가능
  const hasValidSignupProof = (
    active
    && state.stage === "verified"
    && state.email === email
    && typeof state.signupProof === "string"
    && state.signupProof.length > 0
  )

  // 가입 요청에 붙일 주소·증명, 증명 없으면 null (부르는 쪽이 막음)
  const buildSignupPayload = () => (
    hasValidSignupProof ? { email: state.email, signupProof: state.signupProof } : null
  )

  // 밖에서 인증을 버릴 때 (주소 바뀜·가입 끝·증명 거절), 진행 중 응답도 버림
  const reset = () => {
    genRef.current += 1
    setState(INITIAL_VERIFICATION)
  }

  // 남은 초는 그릴 때마다 지금 시각으로 다시 셈
  const now = Date.now()
  const resendRemainingSec = state.resendAvailableAt !== null
    ? Math.max(0, Math.ceil((state.resendAvailableAt - now) / 1000))
    : 0
  const codeRemainingSec = (state.stage === "codeSent" && state.codeExpiresAt !== null)
    ? Math.max(0, Math.ceil((state.codeExpiresAt - now) / 1000))
    : null

  return {
    signupEmailVerification: {
      stage: state.stage,
      code: state.code,
      message: state.message,
      attemptsRemaining: state.attemptsRemaining,
      resendRemainingSec,
      codeRemainingSec,
    },
    handleSignupCodeChange,
    handleRequestSignupCode,
    handleVerifySignupCode,
    hasValidSignupProof,
    buildSignupPayload,
    reset,
  }
}
