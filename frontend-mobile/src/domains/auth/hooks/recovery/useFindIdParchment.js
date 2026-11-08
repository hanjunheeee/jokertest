// 아이디 찾기 버튼 제출 후 문구만 양피지 창으로 (닉네임 띄어쓰기 입력 중 알림은 제외)
// FindIdForm.jsx가 씀
import { useEffect, useRef } from "react"
import { FIND_ID_TEXT } from "@/domains/auth/constants/recoveryMessages.js"
import { FIND_ID_NICKNAME_WHITESPACE_MESSAGE } from "@/domains/auth/validation/recovery.js"
import { showParchmentAlert } from "@m/shared/ui/modal/parchment/parchmentAlert.js"

const STATUS_MSG = {
  notFound: FIND_ID_TEXT.notFound,
  rateLimited: FIND_ID_TEXT.rateLimited,
  failed: FIND_ID_TEXT.failed,
}

export function useFindIdParchment({ status, formError }) {
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
    if (formError === FIND_ID_NICKNAME_WHITESPACE_MESSAGE) {
      prevFormError.current = formError
      return
    }
    showParchmentAlert(formError)
    prevFormError.current = formError
  }, [formError])
}
