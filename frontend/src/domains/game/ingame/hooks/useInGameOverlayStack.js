// 연출 묶음 훅: 역할 공개·추방 영상·낮 시작 연출 → 단계 입장 안내 → 밤 차례 안내 순서로 미루기
// 데스크톱 InGamePage·모바일 useOverlayLayer가 씀
import { useInGameRoleReveal } from "./useInGameRoleReveal.js"
import { useInGamePhaseEntrance } from "./useInGamePhaseEntrance.js"
import { useInGameNightTurnAnnouncement } from "./useInGameNightTurnAnnouncement.js"
import { useInGameStore } from "../store/ingameStore.js"
import { selectInGameSelfAlive } from "../utils/selfAlive.js"
import { selectInGameEntryPreparingActive } from "../utils/selectInGameEntryPreparing.js"

// deathRevealActive = 재판 추방 영상, dawnReportActive = 낮 시작 연출 (끝나야 "낮이 되었습니다"가 뜸)
export function useInGameOverlayStack({ deathRevealActive = false, dawnReportActive = false } = {}) {
  const roleReveal = useInGameRoleReveal()
  const entryPreparingActive = useInGameStore((s) => selectInGameEntryPreparingActive(s.state))
  // 죽은 사람은 밤 차례 안내 안 띄우고 단계 안내는 저절로 닫힘 (할 행동이 없고 죽은 사람 채팅을 안 막게)
  const selfDead = useInGameStore((s) => selectInGameSelfAlive(s.state ?? null) === false)

  const higherPriorityActive = roleReveal.open || deathRevealActive || dawnReportActive
  const phaseEntrance = useInGamePhaseEntrance({ hold: higherPriorityActive, autoClose: selfDead })

  const nightTurn = useInGameNightTurnAnnouncement({
    hold: higherPriorityActive || phaseEntrance.armed,
    skip: selfDead,
  })

  return {
    roleReveal,
    phaseEntrance,
    nightTurn,
    entryPreparingActive,
    interactionBlocked: phaseEntrance.blocking || entryPreparingActive,
  }
}
