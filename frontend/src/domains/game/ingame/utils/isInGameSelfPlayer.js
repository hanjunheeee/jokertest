/**
 * 플레이어 카드가 인증된 본인인지 판정한다. 닉네임이나 배열 위치가 아니라 canonical uuid
 * 동등성만으로 판정한다 — 닉네임이 같은 참가자가 여러 명이어도 정확히 uuid가 일치하는
 * 한 명만 본인으로 표시된다.
 */
export function isInGameSelfPlayer(playerId, localPlayerId) {
  return (
    typeof playerId === "string" &&
    playerId.length > 0 &&
    typeof localPlayerId === "string" &&
    localPlayerId.length > 0 &&
    playerId === localPlayerId
  )
}
