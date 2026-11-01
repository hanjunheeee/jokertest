// 스냅샷 명단 검사와 새 명단 만들기 (순수 계산)
// utils/snapshot/applySnapshot.js가 사용
import { BAD, isNonEmptyString, isNonNegativeInteger, isPlainObject } from "./checks.js"

// 있으면 모양이 맞아야 하는 플레이어 필드 검사
function hasValidOptionalFields(player) {
  if (Object.hasOwn(player, "isParticipating") && typeof player.isParticipating !== "boolean") return false
  if (Object.hasOwn(player, "membershipId") && player.membershipId !== null && !isNonEmptyString(player.membershipId)) return false
  if (Object.hasOwn(player, "themeIndex") && !isNonNegativeInteger(player.themeIndex)) return false
  if (Object.hasOwn(player, "accountProfilePhotoId") && !isNonEmptyString(player.accountProfilePhotoId)) return false
  if (Object.hasOwn(player, "accountProfileBorderId") && !isNonEmptyString(player.accountProfileBorderId)) return false
  if (Object.hasOwn(player, "accountCardFrameId") && player.accountCardFrameId !== null && !isNonEmptyString(player.accountCardFrameId)) return false
  if (Object.hasOwn(player, "accountTotalGames") && !isNonNegativeInteger(player.accountTotalGames)) return false
  if (Object.hasOwn(player, "accountWinRate")
    && (!isNonNegativeInteger(player.accountWinRate) || player.accountWinRate > 100)) return false
  return true
}

// 명단 검사: uuid → 플레이어 지도 (모양이 틀리거나 지금 명단과 사람이 다르면 BAD)
export function readRoster(players, currentPlayers) {
  if (!Array.isArray(players) || players.length === 0) return BAD
  const byUuid = new Map()
  for (const player of players) {
    if (!isPlainObject(player)) return BAD
    if (!isNonEmptyString(player.uuid)) return BAD
    if (!isNonEmptyString(player.nickname)) return BAD
    if (typeof player.isAlive !== "boolean") return BAD
    if (typeof player.isConnected !== "boolean") return BAD
    if (!hasValidOptionalFields(player)) return BAD
    if (byUuid.has(player.uuid)) return BAD
    byUuid.set(player.uuid, player)
  }
  // 지금 명단과 사람 수·얼굴이 같아야 함
  const currentUuids = new Set((currentPlayers ?? []).map((p) => p.uuid))
  if (byUuid.size !== currentUuids.size) return BAD
  for (const uuid of byUuid.keys()) {
    if (!currentUuids.has(uuid)) return BAD
  }
  return byUuid
}

// 새 명단 만들기 (색 번호가 없으면 지금 명단의 색을 이어 씀, 계정 꾸밈 필드는 온 것만)
export function buildPlayers(players, currentPlayers) {
  const themeIndexByUuid = new Map(
    (currentPlayers ?? [])
      .filter((p) => Number.isInteger(p?.themeIndex))
      .map((p) => [p.uuid, p.themeIndex]),
  )

  return players.map((p) => ({
    uuid: p.uuid,
    nickname: p.nickname,
    alive: p.isAlive,
    isConnected: p.isConnected,
    isParticipating: p.isParticipating !== false,
    ...(Object.hasOwn(p, "membershipId") ? { membershipId: p.membershipId } : {}),
    ...(isNonNegativeInteger(p.themeIndex)
      ? { themeIndex: p.themeIndex }
      : themeIndexByUuid.has(p.uuid)
        ? { themeIndex: themeIndexByUuid.get(p.uuid) }
        : {}),
    ...(Object.hasOwn(p, "accountProfilePhotoId") ? { accountProfilePhotoId: p.accountProfilePhotoId } : {}),
    ...(Object.hasOwn(p, "accountProfileBorderId") ? { accountProfileBorderId: p.accountProfileBorderId } : {}),
    ...(Object.hasOwn(p, "accountCardFrameId") ? { accountCardFrameId: p.accountCardFrameId } : {}),
    ...(Object.hasOwn(p, "accountTotalGames") ? { accountTotalGames: p.accountTotalGames } : {}),
    ...(Object.hasOwn(p, "accountWinRate") ? { accountWinRate: p.accountWinRate } : {}),
  }))
}
