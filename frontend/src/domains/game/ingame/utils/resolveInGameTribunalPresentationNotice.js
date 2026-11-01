// 재판 연출 중 보여 줄 안내 고르기 (피고 → 죽음 → 이미 냄 순)
// 재판 연출 화면(InGameTribunalPresentationGate)이 사용
import {
  TRIBUNAL_DEAD_NOTICE,
  TRIBUNAL_DEFENDANT_NOTICE,
  TRIBUNAL_VOTE_SUBMITTED_NOTICE,
} from "../constants/actions/ingameActionPanel.js"

// 피고·죽은 사람·이미 낸 사람 안내, 해당 없으면 null
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
