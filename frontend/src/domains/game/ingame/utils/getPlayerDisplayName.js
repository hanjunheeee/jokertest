export function getPlayerDisplayName(players, uuid) {
  if (!uuid) return "없음"
  return players?.find((player) => player.uuid === uuid)?.nickname || "알 수 없는 참가자"
}
