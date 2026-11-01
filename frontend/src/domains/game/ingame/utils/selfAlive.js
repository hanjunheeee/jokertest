// 내 생존 고르기와 밤 조커 채팅 자격 보기
// 행동 대상 훅·밤 이벤트 손잡이·채팅 채널·조커 채팅·채팅 틀 속성 훅이 사용
import { isSessionPlayerAlive } from "./actionTargets.js"

// 판 참가자 목록에서 내 생존 (모르면 null)
export function selectInGameSelfAlive(state) {
  const selfUuid = state?.self?.uuid
  if (typeof selfUuid !== "string" || selfUuid.length === 0) return null

  const players = state?.players
  if (!Array.isArray(players)) return null

  const selfEntry = players.find((player) => player?.uuid === selfUuid)
  if (!selfEntry || typeof selfEntry.alive !== "boolean") return null

  return selfEntry.alive
}

// 조작 화면용: 판 값이 없으면 세션 참가자 상태로 봄
export function resolveInGameSelfAliveForControls(state, localSessionPlayer) {
  const canonicalAlive = selectInGameSelfAlive(state)
  if (canonicalAlive !== null) return canonicalAlive

  return isSessionPlayerAlive(localSessionPlayer)
}

// 밤에 살아 있는 시민 쪽·조커만 (조커는 죽어도 됨)
export function isJokerNightChatEligible(state) {
  if (state?.phase !== "NIGHT") return false
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return false
  const role = state?.self?.role
  if (!["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"].includes(role)) return false
  return alive || role === "JOKER"
}
