// 결과 화면 이동 훅: 판이 끝나고 승패가 오면 결과 화면으로 한 번 옮김
// 인게임 화면(InGamePage)이 사용, 앞 연출·다시 묶기 중이면 hold로 미룸
import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  isTerminalResultFromOtherAccount,
  readInGameReceiptScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"

// 끝난 판 결과 화면으로 한 번만 이동
export function useInGameResultNavigation({ hold = false } = {}) {
  const navigate = useNavigate()
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const hasWinResult = useInGameStore((s) => Boolean(s.state?.winResult))
  const navigatedRef = useRef(false)

  useEffect(() => {
    // 이미 옮겼거나 판 안 끝났거나 승패 없거나 멈춤이면 안 함
    if (navigatedRef.current) return
    if (phase !== "ENDED") return
    if (!hasWinResult) return
    if (hold) return
    // 다른 계정이 받은 판 결과면 안 옮김
    const auth = useAuthStore.getState()
    if (isTerminalResultFromOtherAccount(readInGameReceiptScope({
      accountId: auth.user?.uuid ?? null,
      identityGeneration: auth.identityGeneration ?? null,
    }))) return

    navigatedRef.current = true
    navigate("/gameresult", { replace: true })
  }, [phase, hasWinResult, hold, navigate])
}
