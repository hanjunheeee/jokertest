import { selectInGameSelfAlive } from "./selectInGameSelfAlive.js"

/**
 * 현재 gameState가 JOKER 전용 NIGHT 채팅 자격을 갖췄는지 판정한다.
 *
 * phase·진영에 더해 canonical roster의 생존 여부(selectInGameSelfAlive)까지 요구한다 —
 * 서버 prepareJokerChatMessage가 사망한 JOKER의 제출을 NOT_ELIGIBLE로 거부하고
 * getChatRecipientUuids의 JOKER 채널에서도 제외하므로, 클라이언트도 사망 즉시 JOKER 채팅을
 * 송신·수신·표시 대상에서 함께 내려야 한다(사망자는 사망자 전용 채팅만 쓴다).
 *
 * 생존 여부를 아직 알 수 없으면(roster에 self가 없는 등 — selectInGameSelfAlive가 null)
 * 자격을 주지 않는다(fail-closed).
 */
export function isJokerNightChatEligible(state) {
  if (state?.phase !== "NIGHT") return false
  if (state?.self?.team !== "JOKER") return false
  return selectInGameSelfAlive(state) === true
}
