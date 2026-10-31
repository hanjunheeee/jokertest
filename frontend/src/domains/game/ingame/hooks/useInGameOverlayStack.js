import { useInGameRoleReveal } from "./useInGameRoleReveal.js"
import { useInGamePhaseEntrance } from "./useInGamePhaseEntrance.js"
import { useInGameNightTurnAnnouncement } from "./useInGameNightTurnAnnouncement.js"

export function useInGameOverlayStack({ deathRevealActive = false } = {}) {
  const roleReveal = useInGameRoleReveal()

  const higherPriorityActive = roleReveal.open || deathRevealActive
  const phaseEntrance = useInGamePhaseEntrance({ hold: higherPriorityActive })

  const nightTurn = useInGameNightTurnAnnouncement({
    hold: higherPriorityActive || phaseEntrance.armed,
  })

  return {
    roleReveal,
    phaseEntrance,
    nightTurn,
    interactionBlocked: phaseEntrance.blocking,
  }
}
