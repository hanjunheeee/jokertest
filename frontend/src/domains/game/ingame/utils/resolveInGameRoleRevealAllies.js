/**
 * getInGameRoleRevealInfo가 반환한 ally uuid 목록을 roster(players)의 nickname과 매칭해
 * 오버레이가 그릴 수 있는 {uuid, nickname} 목록으로 만든다. roster에 없는 uuid는 조용히
 * 걸러낸다(오염된/불일치 payload가 화면에 빈 이름으로 새어나가지 않게).
 */
export function resolveInGameRoleRevealAllies(allyUuids, players) {
  if (!Array.isArray(allyUuids) || allyUuids.length === 0) return []
  if (!Array.isArray(players)) return []

  const nicknameByUuid = new Map(players.map((player) => [player.uuid, player.nickname]))

  return allyUuids
    .filter((uuid) => nicknameByUuid.has(uuid))
    .map((uuid) => ({ uuid, nickname: nicknameByUuid.get(uuid) }))
}
