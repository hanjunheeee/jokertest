// 대기방 자리 계산: 방 상태로 자리 목록 만들기·자리를 줄로 나누기
// useMatchingPage·PlayerSlotGrid·MatchingPartySlots가 씀
// 한 줄 칸 수
export const PLAYER_SLOT_COLUMNS = 5

// 판 끝 뒤 비워 둔 방장 자리 칸 id (사람 uuid와 안 겹치게)
export const RESERVED_HOST_SLOT_ID = "reserved-host-seat"

// 방에 있으면 사람 자리(방장 자리를 비워 둔 방이면 맨 앞에 방장 자리 칸), 방 밖이면 빈 목록
// (가짜 준비 자리는 멀티플레이 안내용이라 대기방 URL에선 쓰지 않음)
// 예: 방장 자리 비움 + 2명 → [{ id: "reserved-host-seat", reservedHost: true }, { id: "u1" }, { id: "u2" }]
export function buildSlots({ isInRoom, players, hostSeatReserved = false }) {
  if (!isInRoom) return []
  const playerSlots = players.map((player) => ({
    id: player.uuid,
    ready: Boolean(player.isReady),
    accountProfilePhotoId: player.accountProfilePhotoId,
    accountProfileBorderId: player.accountProfileBorderId,
  }))
  if (!hostSeatReserved) return playerSlots
  return [{ id: RESERVED_HOST_SLOT_ID, ready: false, reservedHost: true }, ...playerSlots]
}

// 한 줄에 columns개씩 끊음
export function chunkPlayerSlots(slots, columns = PLAYER_SLOT_COLUMNS) {
  const rows = []

  for (let index = 0; index < slots.length; index += columns) {
    rows.push(slots.slice(index, index + columns))
  }

  return rows
}
