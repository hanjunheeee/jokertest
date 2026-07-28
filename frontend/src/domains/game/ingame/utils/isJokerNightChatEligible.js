/** 현재 gameState가 JOKER 전용 NIGHT 채팅 자격을 갖췄는지 판정한다. */
export function isJokerNightChatEligible(state) {
  return !!(state?.phase === "NIGHT" && state?.self?.team === "JOKER")
}
