import { useEffect, useRef, useState } from "react"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGameRoleRevealInfo } from "../utils/roleReveal.js"
import { useInGameRoleRevealAck } from "./useInGameRoleRevealAck.js"

export function useInGameRoleReveal() {
  const gameId = useInGameStore((s) => s.gameId)
  const self = useInGameStore((s) => s.state?.self ?? null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)

  useInGameRoleRevealAck()

  const [open, setOpen] = useState(false)
  const revealedIdentityRef = useRef(null)

  const roleInfo = getInGameRoleRevealInfo(self, { authUuid })

  useEffect(() => {
    if (!gameId || !authUuid || !roleInfo) return

    const identity = `${gameId}:${authUuid}`
    if (revealedIdentityRef.current === identity) return

    revealedIdentityRef.current = identity
    setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, authUuid, self])

  const close = () => setOpen(false)
  const reopen = () => {
    if (!roleInfo) return
    setOpen(true)
  }

  return { open, close, reopen, roleInfo }
}
