import { useEffect, useRef, useState } from "react"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGameRoleRevealInfo } from "../utils/getInGameRoleRevealInfo.js"
import { useInGameRoleRevealAck } from "./useInGameRoleRevealAck.js"

/**
 * 파치먼트 역할 공개 오버레이의 열림 상태를 관리한다. 순수하게 로컬 UI 상태만 다루며
 * (socket emit·REST·canonical store 변경 없음), ROLE_REVEAL→NIGHT 전이에 필요한
 * acknowledge_role_reveal 자동 발사는 useInGameRoleRevealAck에 위임한다(화면 표시와
 * 완전히 분리된 배경 동작).
 *
 * 자동으로 여는 규칙: (gameId, 인증 uuid) 조합 — "reveal identity" — 하나당 정확히 한 번만
 * 연다. 같은 identity에서 반복되는 roster·phase·connectivity·스냅샷 갱신은 절대 다시 열지
 * 않는다(이미 그 identity를 열었다는 사실만 ref로 기억한다). gameId 또는 인증 uuid가 실제로
 * 바뀌면(다른 게임/다른 계정) 새 identity로 취급해 다시 한 번 자동으로 연다.
 */
export function useInGameRoleReveal() {
  const gameId = useInGameStore((s) => s.gameId)
  const self = useInGameStore((s) => s.state?.self ?? null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)

  // ack 발사는 화면 표시와 무관하게 항상 배경에서 진행되어야 한다 — 반환값은 이 훅의
  // 오버레이 상태와 아무 관계가 없으므로 그대로 버린다.
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
    // roleInfo는 self가 바뀔 때마다 새 객체로 계산되므로 deps에서 제외하고, 그 원천인
    // self를 대신 넣는다 — self가 실제로 갱신될 때만(참조가 바뀔 때만) 이 effect가 다시
    // "열어도 되는지" 검토하게 한다(위 revealedIdentityRef 가드가 실제 재오픈 여부를 결정).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, authUuid, self])

  const close = () => setOpen(false)
  const reopen = () => {
    if (!roleInfo) return
    setOpen(true)
  }

  return { open, close, reopen, roleInfo }
}
