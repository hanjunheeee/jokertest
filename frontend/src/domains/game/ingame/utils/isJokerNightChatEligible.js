import { selectInGameSelfAlive } from "./selectInGameSelfAlive.js"

/**
 * 현재 gameState가 역할별 NIGHT 채팅 자격을 갖췄는지 판정한다.
 *
 * 생존자는 자신의 역할 채널을 쓰고, 사망자는 JOKER만 같은 채널을 계속 열람·전송한다.
 * 기존 호출부 호환을 위해 함수 이름은 유지하지만 정책은 모든 게임 역할을 다룬다.
 *
 * 이 한 함수가 useInGameJokerChatSession의 리스너 등록·전송과 InGameChatShell의 화면 선택을
 * 동시에 지배하므로, 여기만 열면 열람·전송·표시가 함께 열린다.
 *
 * 생존 여부를 아직 알 수 없으면(roster에 self가 없는 등 — selectInGameSelfAlive가 null)
 * 자격을 주지 않는다(fail-closed).
 * @param {object} state - canonical 인게임 state
 */
export function isJokerNightChatEligible(state) {
  if (state?.phase !== "NIGHT") return false
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return false
  const role = state?.self?.role
  if (!["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"].includes(role)) return false
  return alive || role === "JOKER"
}
