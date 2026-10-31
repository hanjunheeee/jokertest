import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  isTerminalResultFromOtherAccount,
  readInGameReceiptScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"

export function useInGameResultNavigation({ hold = false } = {}) {
  const navigate = useNavigate()
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const hasWinResult = useInGameStore((s) => Boolean(s.state?.winResult))
  const navigatedRef = useRef(false)

  useEffect(() => {
    if (navigatedRef.current) return
    if (phase !== "ENDED") return
    if (!hasWinResult) return
    if (hold) return
    const auth = useAuthStore.getState()
    if (isTerminalResultFromOtherAccount(readInGameReceiptScope({
      accountId: auth.user?.uuid ?? null,
      identityGeneration: auth.identityGeneration ?? null,
    }))) return

    navigatedRef.current = true
    navigate("/gameresult", { replace: true })
  }, [phase, hasWinResult, hold, navigate])
}
