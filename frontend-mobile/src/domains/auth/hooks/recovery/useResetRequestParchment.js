// 재설정 링크 보내기 버튼 제출 후 문구만 양피지 창으로
// ResetRequestForm.jsx가 씀
import { useEffect, useRef } from "react"
import { REQUEST_TEXT } from "@/domains/auth/constants/recoveryMessages.js"
import { showParchmentAlert } from "@m/shared/ui/modal/parchment/parchmentAlert.js"

const STATUS_MSG = {
  rateLimited: REQUEST_TEXT.rateLimited,
  failed: REQUEST_TEXT.failed,
}

export function useResetRequestParchment({ status, formError }) {
  const prevStatus = useRef(status)
  const prevFormError = useRef(formError)

  useEffect(() => {
    if (status === prevStatus.current) return
    const message = STATUS_MSG[status]
    if (message) showParchmentAlert(message)
    prevStatus.current = status
  }, [status])

  useEffect(() => {
    if (status === "submitting") prevFormError.current = ""
  }, [status])

  useEffect(() => {
    if (!formError || formError === prevFormError.current) return
    showParchmentAlert(formError)
    prevFormError.current = formError
  }, [formError])
}
