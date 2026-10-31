import {
  TRIBUNAL_DEAD_NOTICE,
  TRIBUNAL_DEFENDANT_NOTICE,
  TRIBUNAL_VOTE_SUBMITTED_NOTICE,
} from "../constants/actions/ingameActionPanel.js"

export function resolveInGameTribunalPresentationNotice({
  isDefendant = false,
  alive = true,
  hasSubmitted = false,
  status = "idle",
} = {}) {
  if (isDefendant) return TRIBUNAL_DEFENDANT_NOTICE
  if (alive === false) return TRIBUNAL_DEAD_NOTICE
  if (hasSubmitted || status === "submitted") return TRIBUNAL_VOTE_SUBMITTED_NOTICE
  return null
}
