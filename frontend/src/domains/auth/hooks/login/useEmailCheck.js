// 가입 이메일 중복 확인 (확인한 뒤 주소가 바뀌면 결과를 지움)
// components/SignupForm/SignupFields.jsx가 사용, useLoginPage.js가 시험용 이름으로 다시 내보냄
import { useRef, useState } from "react"
import { checkEmailApi } from "../../api/auth.api.js"

// 너무 많이 눌러 서버가 막았는데 서버 글이 없을 때
const RATE_LIMITED_TEXT = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."

// 상태: idle / checking / available / duplicate / error, errorMessage는 429일 때만 (나머지 실패는 화면 기본 글)
export function useEmailCheck(email) {
  const [status, setStatus] = useState("idle")
  const [checkedEmail, setCheckedEmail] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  const latestRequestId = useRef(0)

  // 확인한 주소와 지금 주소가 다르면 결과를 버림 (그리는 자리에서 바로, 옛 결과가 한 번도 안 보이게)
  if (checkedEmail !== null && checkedEmail !== email) {
    setStatus("idle")
    setCheckedEmail(null)
    setErrorMessage(null)
  }

  // 빈 주소는 안 물어봄, 마지막에 보낸 확인 응답만 반영
  const check = async () => {
    const trimmed = email.trim()
    if (!trimmed) return

    const requestId = ++latestRequestId.current
    setStatus("checking")
    setCheckedEmail(null)
    setErrorMessage(null)
    try {
      const { available } = await checkEmailApi(trimmed)
      if (latestRequestId.current !== requestId) return
      setStatus(available ? "available" : "duplicate")
      setCheckedEmail(trimmed)
    } catch (error) {
      if (latestRequestId.current !== requestId) return
      setStatus("error")
      setCheckedEmail(null)
      // 너무 많이 눌러 막힌 것이면 서버 글 (늘 "실패했습니다"면 다시 눌러 더 막힘)
      if (error?.status === 429) setErrorMessage(error.message || RATE_LIMITED_TEXT)
    }
  }

  return { status, check, errorMessage }
}
