import { selectInGameSelfAlive } from "./selectInGameSelfAlive.js"

export function isJokerNightChatEligible(state) {
  if (state?.phase !== "NIGHT") return false
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return false
  const role = state?.self?.role
  if (!["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"].includes(role)) return false
  return alive || role === "JOKER"
}
