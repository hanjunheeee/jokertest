// 재설정 링크(token) 확인 요청과 다시 확인
// hooks/recovery/useResetPage.js가 사용, 화면 상태 바꾸기는 받아서 씀
import { useEffect, useRef, useState } from "react"
import { verifyPasswordResetApi } from "../../api/auth.api.js"
import { RESET_TEXT } from "../../constants/recoveryMessages.js"

// 같은 방문·같은 token이면 보낸 요청 하나를 같이 씀 (StrictMode로 effect가 두 번 돌아도 한 번만 보냄)
export function useLinkCheck({ token, setStatus, setLinkInvalidReason, unmountedRef, visitIdRef }) {
  const [verifyFailedMessage, setVerifyFailedMessage] = useState(RESET_TEXT.verifyFailed)
  const [reloadKey, setReloadKey] = useState(0)

  // 마지막에 본 token, 보낸 요청 캐시 (키 = 방문·다시 확인 횟수·token)
  const visitedTokenRef = useRef(null)
  const cacheRef = useRef({ key: "", promise: null })

  useEffect(() => {
    // token이 바뀌면 새 방문으로 셈, 옛 방문 응답은 버림
    if (visitedTokenRef.current !== token) {
      visitedTokenRef.current = token
      visitIdRef.current += 1
    }
    const visitId = visitIdRef.current

    // token 없으면 물어볼 것도 없이 잘못된 링크
    if (!token) {
      setLinkInvalidReason("INVALID")
      setStatus("linkInvalid")
      return
    }

    // 확인 중으로 바꿈, effect 정리 때 응답 버리게 표시
    let cancelled = false
    setStatus("verifying")

    // 키가 같으면 이미 보낸 요청을 다시 씀
    const cacheKey = `${visitId}:${reloadKey}:${token}`
    let promise = cacheRef.current.key === cacheKey ? cacheRef.current.promise : null
    if (!promise) {
      promise = verifyPasswordResetApi({ token })
      cacheRef.current = { key: cacheKey, promise }
    }

    promise
      .then((result) => {
        // 정리됨·화면 나감·다른 방문이면 버림
        if (cancelled || unmountedRef.current || visitIdRef.current !== visitId) return
        // 쓸 수 있음 / 만료·사용됨·잘못됨 / 그 밖은 확인 실패 (캐시 비워서 다시 확인 때 새로 보냄)
        if (result?.ok === true && result.status === "VALID") {
          setStatus("ready")
        } else if (result?.ok === false && (result.code === "EXPIRED" || result.code === "USED" || result.code === "INVALID")) {
          setLinkInvalidReason(result.code)
          setStatus("linkInvalid")
        } else {
          cacheRef.current = { key: "", promise: null }
          setVerifyFailedMessage(RESET_TEXT.verifyFailed)
          setStatus("verifyFailed")
        }
      })
      .catch((error) => {
        // 실패한 요청은 버려진 방문이어도 캐시에서 지움
        cacheRef.current = { key: "", promise: null }
        if (cancelled || unmountedRef.current || visitIdRef.current !== visitId) return
        setVerifyFailedMessage(error?.status === 429 ? RESET_TEXT.verifyRateLimited : RESET_TEXT.verifyFailed)
        setStatus("verifyFailed")
      })

    return () => { cancelled = true }
  }, [token, reloadKey, setStatus, setLinkInvalidReason, unmountedRef, visitIdRef])

  // 다시 확인: 캐시 비우고 reloadKey를 올려 위 effect를 다시 돌림
  const retryVerify = () => {
    cacheRef.current = { key: "", promise: null }
    setReloadKey((k) => k + 1)
  }

  return { verifyFailedMessage, retryVerify }
}
