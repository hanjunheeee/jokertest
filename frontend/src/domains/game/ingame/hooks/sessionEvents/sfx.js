// 판 진행 효과음: 사건마다 효과음 보내기·판이 끝났으면 결과 효과음
// hooks/sessionEvents/ 손잡이 묶음이 사용
import { dispatchSfxEvent } from "../../../../../shared/hooks/useSfxRuntime.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { SFX_RESULT_WINNERS } from "../../constants/ingameSfx.js"
import { currentAccountId } from "./scope.js"

// 사건이 알려 준 재생 출처 (없으면 실시간)
export const originOf = (payload) => payload?.sfxEvent?.origin ?? payload?.origin ?? "live"

// 효과음 보내기 (사건 id·판 id·로그인 계정이 다 있을 때만)
export function playGameSfx(kind, eventId, gameId, origin = "live") {
  if (typeof eventId !== "string" || eventId.length === 0) return
  if (typeof gameId !== "string" || gameId.length === 0) return
  const accountId = currentAccountId()
  if (accountId === null) return
  dispatchSfxEvent({ kind, eventId, accountId, gameId, origin })
}

// 판이 끝났고 승자가 정해졌으면 결과 효과음
export function playResultSfxIfEnded(origin = "live") {
  const current = useInGameStore.getState()
  if (!current.gameId || !current.state) return
  if (current.state.phase !== "ENDED") return
  if (!SFX_RESULT_WINNERS.has(current.state.winResult?.winner)) return
  playGameSfx("game-result", `game:${current.gameId}:result`, current.gameId, origin)
}
