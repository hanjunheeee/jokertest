// 아이디 찾기 화면 상태와 찾기 요청
// pages/FindIdPage.jsx가 사용
import { useEffect, useRef, useState } from "react"
import { findIdApi } from "../../api/auth.api.js"
import { FIND_ID_TEXT } from "../../constants/recoveryMessages.js"
import { validateFindId } from "../../validation/recovery.js"

// 찾기 상태: idle → submitting → found / notFound / rateLimited / failed
export function useFindId() {
  const [status, setStatus] = useState("idle")
  const [nickname, setNickname] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [formError, setFormError] = useState("")

  // 보내기 잠금·요청 세대·화면 나감 표시
  const submittingRef = useRef(false)
  const genRef = useRef(0)
  const unmountedRef = useRef(false)

  // 화면을 나간 뒤 온 응답은 버리려고 표시함
  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  // 입력 검사 뒤 요청, 마지막에 보낸 요청 응답만 반영
  const submit = () => {
    const check = validateFindId(nickname, birthDate)
    if (!check.ok) {
      setFormError(check.message)
      return
    }

    submittingRef.current = true
    setFormError("")
    setStatus("submitting")
    const gen = ++genRef.current

    findIdApi({ nickname: nickname.trim(), birthDate })
      .then((result) => {
        if (unmountedRef.current || genRef.current !== gen) return
        submittingRef.current = false

        // 가린 이메일이 비어 있으면 찾은 걸로 안 봄
        const hint = typeof result?.maskedEmail === "string" ? result.maskedEmail.trim() : ""

        if (result?.ok === true && hint !== "") {
          setMaskedEmail(hint)
          setNickname("")
          setBirthDate("")
          setStatus("found")
        } else if (result?.ok === false && result.code === "NOT_FOUND") {
          setStatus("notFound")
        } else {
          setStatus("failed")
        }
      })
      .catch((error) => {
        if (unmountedRef.current || genRef.current !== gen) return
        submittingRef.current = false

        // 429는 잠시 막힘, 400은 입력 문제라 입력 화면으로 돌림
        if (error?.status === 429) {
          setStatus("rateLimited")
        } else if (error?.status === 400) {
          setFormError(FIND_ID_TEXT.badInput)
          setStatus("idle")
        } else {
          setStatus("failed")
        }
      })
  }

  // 보내는 중이면 무시 (ref로 같은 순간 두 번 누름도 막기)
  const handleSubmit = (event) => {
    event.preventDefault()
    if (status === "submitting" || submittingRef.current) return
    submit()
  }

  // 결과·에러 지우고 입력 화면으로
  const backToIdle = () => {
    setFormError("")
    setStatus("idle")
  }

  return { status, nickname, setNickname, birthDate, setBirthDate, maskedEmail, formError, handleSubmit, backToIdle }
}
