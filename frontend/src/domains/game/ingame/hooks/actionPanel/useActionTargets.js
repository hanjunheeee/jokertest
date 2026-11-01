// 행동 대상 목록 훅: 밤 행동·낮 투표 대상과 조작용 본인 생존
// 행동 패널(useInGameActionPanel)이 씀
import { useMemo } from "react"
import { isSelfTargetAllowedForNightAction } from "../../constants/actions/ingameActionPanel.js"
import { useInGamePlayerSessionContext } from "../../components/InGamePlayerSessionContext.js"
import { buildNightActionTargets, buildDayVoteTargets } from "../../utils/actionTargets.js"
import { resolveInGameSelfAliveForControls } from "../../utils/selfAlive.js"

// 대상은 판 명단 컨텍스트로 만들고, 내 역할·재투표 제외는 스토어 상태에서 읽음
export function useActionTargets(gameState) {
  const myRole = gameState?.self?.role
  const dayVoteExcludedUuids = gameState?.dayVoteExcludedUuids
  const { players: sessionPlayers, localPlayerId } = useInGamePlayerSessionContext()

  // 밤 행동 대상 (역할이 자기 지정을 허용할 때만 본인 포함)
  const nightActionTargets = useMemo(
    () =>
      buildNightActionTargets(sessionPlayers, {
        localPlayerId,
        selfTargetAllowed: isSelfTargetAllowedForNightAction(myRole),
        role: myRole,
      }),
    [sessionPlayers, localPlayerId, myRole],
  )

  // 낮 투표 대상 (재투표 제외 대상 빼고)
  const dayVoteTargets = useMemo(
    () => buildDayVoteTargets(sessionPlayers, { localPlayerId, excludedUuids: dayVoteExcludedUuids }),
    [sessionPlayers, localPlayerId, dayVoteExcludedUuids],
  )

  // 본인 생존은 서버 상태 값 먼저, 모르면 명단의 내 칸으로 봄
  const localSessionPlayer = sessionPlayers?.find((player) => player.id === localPlayerId)
  const selfAliveForControls = resolveInGameSelfAliveForControls(gameState ?? null, localSessionPlayer)

  return { nightActionTargets, dayVoteTargets, selfAliveForControls }
}
