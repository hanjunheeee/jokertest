// 역할 공개 훅: 판에 들어오면 내 역할 창을 한 번 띄우고 닫기·다시 열기
// 오버레이 묶음 훅(useInGameOverlayStack)이 사용
// 서버는 확인을 안 기다리고 10초 뒤 첫 낮으로 넘김 → 확인은 화면에서만 닫음, 저절로 연 창은 10초 뒤나 역할 공개 단계가 끝나면 저절로 닫힘 (사용자 결정 2026-11-09)
import { useEffect, useRef, useState } from "react"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGameRoleRevealInfo } from "../utils/roleReveal.js"

// 저절로 연 역할 창이 열려 있는 시간 (서버 역할 공개 시간과 같게)
export const INGAME_ROLE_REVEAL_AUTO_CLOSE_MS = 10000

// 역할 창 열림·역할 정보와 닫기·다시 열기
export function useInGameRoleReveal() {
  const gameId = useInGameStore((s) => s.gameId)
  const self = useInGameStore((s) => s.state?.self ?? null)
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)

  const [open, setOpen] = useState(false)
  // 역할 공개 단계에서 저절로 연 창인지 (단계가 끝나면 닫으려고, 사람이 다시 연 창은 안 닫음)
  const [autoOpenedInReveal, setAutoOpenedInReveal] = useState(false)
  // 판·계정마다 한 번만 자동으로 띄우려고 둠
  const revealedIdentityRef = useRef(null)
  // 저절로 닫기 예약 (사람이 닫거나 다시 열면 끔)
  const autoCloseTimerRef = useRef(null)

  const roleInfo = getInGameRoleRevealInfo(self, { authUuid })

  // 저절로 닫기 예약 끄기
  const cancelAutoClose = () => {
    if (autoCloseTimerRef.current === null) return
    clearTimeout(autoCloseTimerRef.current)
    autoCloseTimerRef.current = null
  }

  // 역할 정보가 생기면 그 판·계정에서 처음 한 번만 엶, 10초 뒤 저절로 닫음
  useEffect(() => {
    if (!gameId || !authUuid || !roleInfo) return

    const identity = `${gameId}:${authUuid}`
    if (revealedIdentityRef.current === identity) return

    revealedIdentityRef.current = identity
    setOpen(true)
    setAutoOpenedInReveal(phase === "ROLE_REVEAL")
    cancelAutoClose()
    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null
      setAutoOpenedInReveal(false)
      setOpen(false)
    }, INGAME_ROLE_REVEAL_AUTO_CLOSE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, authUuid, self])

  // 저절로 연 창은 첫 낮 등으로 넘어가면 10초 전이라도 닫음 (서버가 단계를 먼저 넘긴 경우), 그리는 중에 맞춤
  if (autoOpenedInReveal && phase !== "ROLE_REVEAL") {
    setAutoOpenedInReveal(false)
    if (open) setOpen(false)
  }

  // 화면 빠지면 예약 끔
  useEffect(() => cancelAutoClose, [])

  // 닫기(화면에서만), 역할 정보가 있을 때만 다시 열기 (다시 연 창은 사람이 닫을 때까지 둠)
  const close = () => {
    cancelAutoClose()
    setAutoOpenedInReveal(false)
    setOpen(false)
  }
  const reopen = () => {
    if (!roleInfo) return
    cancelAutoClose()
    setAutoOpenedInReveal(false)
    setOpen(true)
  }

  return { open, close, reopen, roleInfo }
}
