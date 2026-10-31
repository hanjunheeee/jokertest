export function resolveInGameRoleRevealAllies(allyUuids, players) {
  if (!Array.isArray(allyUuids) || allyUuids.length === 0) return []
  if (!Array.isArray(players)) return []

  const nicknameByUuid = new Map(players.map((player) => [player.uuid, player.nickname]))

  return allyUuids
    .filter((uuid) => nicknameByUuid.has(uuid))
    .map((uuid) => ({ uuid, nickname: nicknameByUuid.get(uuid) }))
}
