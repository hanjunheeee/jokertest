import {
  TRIBUNAL_DEAD_NOTICE,
  TRIBUNAL_DEFENDANT_NOTICE,
  TRIBUNAL_VOTE_SUBMITTED_NOTICE,
} from "../constants/actions/ingameActionPanel.js"

/**
 * 최후의 반론 연출 — 유/무죄 버튼 대신 보여줄 안내 문구.
 * @param {object} [options]
 * @param {boolean} [options.isDefendant]
 * @param {boolean} [options.alive]
 * @param {boolean} [options.hasSubmitted]
 * @param {"idle" | "submitting" | "submitted"} [options.status]
 */
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
