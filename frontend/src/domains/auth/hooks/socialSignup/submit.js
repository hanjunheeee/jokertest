// 소셜 가입 완료 보내기 (입력 검사 → 요청 → 결과 반영)
// hooks/useSocialSignup.js의 submit이 부름 (ctx = 훅의 상태·ref·인증 묶음)
import { completeSocialSignupApi } from "../../api/auth.api.js"
import { SOCIAL_SIGNUP_TEXT } from "../../constants/socialMessages.js"
import { isCompletedSignupUser, submitErrorView } from "../../utils/socialErrors.js"
import { validateBirthDate, validateNickname } from "../../validation/signupValidation.js"

// 보내기 전 검사: token → 가입 정보 준비 → 닉네임 → 생년월일(넣었을 때만) → 이메일 인증 순서
function checkInput(ctx, { nickname, birthDate }) {
  if (typeof ctx.intentToken !== "string" || !ctx.intentToken) {
    return { ok: false, status: "expired", message: SOCIAL_SIGNUP_TEXT.sessionExpired }
  }
  if (ctx.intentStatus !== "ready") {
    return { ok: false, status: "error", message: SOCIAL_SIGNUP_TEXT.intentLoading }
  }

  const nicknameResult = validateNickname(nickname)
  if (!nicknameResult.ok) return { ok: false, status: "error", message: nicknameResult.message }

  let birthDateValue
  if (birthDate) {
    const birthDateResult = validateBirthDate(birthDate)
    if (!birthDateResult.ok) return { ok: false, status: "error", message: birthDateResult.message }
    birthDateValue = birthDateResult.value
  }

  let proof
  if (ctx.emailVerificationRequired) {
    proof = ctx.verification.buildSignupPayload()
    if (!proof) return { ok: false, status: "error", message: SOCIAL_SIGNUP_TEXT.needEmailVerify }
  }

  return { ok: true, nickname: nicknameResult.value, birthDate: birthDateValue, proof }
}

// 보내는 동안 다시 못 보내게 잠금, 그사이 가입 정보를 다시 불러왔으면 응답을 버림
export async function submitSignup(ctx, { nickname, birthDate }) {
  if (ctx.submittingRef.current) return

  const input = checkInput(ctx, { nickname, birthDate })
  // 검사에 걸리면 요청 없이 상태·문구만
  if (!input.ok) {
    ctx.setStatus(input.status)
    ctx.setErrorMessage(input.message)
    return
  }

  // 잠그고 보낼 때 세대 번호 기억
  ctx.submittingRef.current = true
  const submitGen = ctx.genRef.current
  ctx.setStatus("submitting")
  ctx.setErrorMessage(null)
  try {
    const result = await completeSocialSignupApi({
      intentToken: ctx.intentToken,
      nickname: input.nickname,
      birthDate: input.birthDate,
      email: input.proof?.email,
      signupProof: input.proof?.signupProof,
    })
    if (ctx.genRef.current !== submitGen) return
    // uuid 있는 user가 안 오면 통신 실패로 봄
    if (!isCompletedSignupUser(result?.user)) {
      ctx.setStatus("error")
      ctx.setErrorMessage(SOCIAL_SIGNUP_TEXT.generic)
      return
    }
    // 로그인 처리 뒤 로비로
    ctx.login(result.user)
    ctx.setStatus("done")
    ctx.navigate("/lobby")
  } catch (error) {
    if (ctx.genRef.current !== submitGen) return

    // 인증 증명이 없거나 거절이면 인증부터 다시 받게 비움
    const view = submitErrorView(error)
    if (view.proofLost) ctx.verification.reset()
    ctx.setStatus(view.status)
    ctx.setErrorMessage(view.message)
  } finally {
    ctx.submittingRef.current = false
  }
}
