// 가입 이메일 중복 확인 (확인한 뒤 주소가 바뀌면 결과를 지움)
// components/SignupForm/SignupFields.jsx가 사용, useLoginPage.js가 시험용 이름으로 다시 내보냄
import { useEffect, useRef, useState } from "react"
import { checkEmailApi } from "../../api/auth.api.js"

// 상태: idle / checking / available / duplicate / error
export function useEmailCheck(email) {
  const [status, setStatus] = useState("idle")
  const [checkedEmail, setCheckedEmail] = useState(null)

  const latestRequestId = useRef(0)

  // 확인한 주소와 지금 주소가 다르면 결과를 버림
  useEffect(() => {
    if (checkedEmail !== null && checkedEmail !== email) {
      setStatus("idle")
      setCheckedEmail(null)
    }
  }, [email, checkedEmail])

  // 빈 주소는 안 물어봄, 마지막에 보낸 확인 응답만 반영
  const check = async () => {
    const trimmed = email.trim()
    if (!trimmed) return

    const requestId = ++latestRequestId.current
    setStatus("checking")
    setCheckedEmail(null)
    try {
      const { available } = await checkEmailApi(trimmed)
      if (latestRequestId.current !== requestId) return
      setStatus(available ? "available" : "duplicate")
      setCheckedEmail(trimmed)
    } catch {
      if (latestRequestId.current !== requestId) return
      setStatus("error")
      setCheckedEmail(null)
    }
  }

  return { status, check }
}
