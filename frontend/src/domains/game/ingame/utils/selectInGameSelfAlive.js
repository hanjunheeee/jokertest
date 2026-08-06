/**
 * 본인의 canonical 생존 여부를 store state에서 유도한다(순수 함수).
 *
 * 서버 payload(buildGameStartedPayload/buildSessionSnapshot)의 self에는 alive 필드가 없고,
 * 생존 상태는 오직 roster(state.players[].alive)에만 담긴다 — 그래서 self.uuid로 roster에서
 * 본인 항목을 찾아 그 alive를 읽는 것이 유일한 canonical 경로다. 닉네임이나 배열 위치가
 * 아니라 uuid 동등성만으로 찾는다(isInGameSelfPlayer와 동일한 원칙).
 *
 * 판정에 필요한 값이 하나라도 없거나 형태가 어긋나면 true/false를 추측하지 않고 null을
 * 반환한다 — 호출부는 null을 "아직 모름"으로 보고 전송·채널 선택을 모두 막아야 한다
 * (fail-closed). 서버가 최종 권한이지만, 클라이언트도 모르는 상태에서 임의로 채널을
 * 고르지 않는다.
 */
export function selectInGameSelfAlive(state) {
  const selfUuid = state?.self?.uuid
  if (typeof selfUuid !== "string" || selfUuid.length === 0) return null

  const players = state?.players
  if (!Array.isArray(players)) return null

  const selfEntry = players.find((player) => player?.uuid === selfUuid)
  if (!selfEntry || typeof selfEntry.alive !== "boolean") return null

  return selfEntry.alive
}
