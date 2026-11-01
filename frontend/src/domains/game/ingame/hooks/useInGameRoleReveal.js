// 역할 공개 훅: 판에 들어오면 내 역할 창을 한 번 띄우고 닫기·다시 열기
// 오버레이 묶음 훅(useInGameOverlayStack)이 사용, 서버 알림은 useInGameRoleRevealAck
import { useEffect, useRef, useState } from "react"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGameRoleRevealInfo } from "../utils/roleReveal.js"
import { useInGameRoleRevealAck } from "./useInGameRoleRevealAck.js"

// 역할 창 열림·역할 정보와 닫기·다시 열기
export function useInGameRoleReveal() {
  const gameId = useInGameStore((s) => s.gameId)
  const self = useInGameStore((s) => s.state?.self ?? null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)

  // 역할 봤다고 서버에 알림 (창 열림과 따로 감)
  useInGameRoleRevealAck()

  const [open, setOpen] = useState(false)
  // 판·계정마다 한 번만 자동으로 띄우려고 둠
  const revealedIdentityRef = useRef(null)

  const roleInfo = getInGameRoleRevealInfo(self, { authUuid })

  // 역할 정보가 생기면 그 판·계정에서 처음 한 번만 엶
  useEffect(() => {
    if (!gameId || !authUuid || !roleInfo) return

    const identity = `${gameId}:${authUuid}`
    if (revealedIdentityRef.current === identity) return

    revealedIdentityRef.current = identity
    setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, authUuid, self])

  // 닫기, 역할 정보가 있을 때만 다시 열기
  const close = () => setOpen(false)
  const reopen = () => {
    if (!roleInfo) return
    setOpen(true)
  }

  return { open, close, reopen, roleInfo }
}
