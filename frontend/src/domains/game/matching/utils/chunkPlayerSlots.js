// 대기방 자리 계산: 방 상태로 자리 목록 만들기·자리를 줄로 나누기
// useMatchingPage·PlayerSlotGrid·MatchingPartySlots가 씀
// 한 줄 칸 수
export const PLAYER_SLOT_COLUMNS = 5

// 방에 있으면 사람 자리, 방 밖이면 빈 목록 (가짜 준비 자리는 멀티플레이 안내용이라 대기방 URL에선 쓰지 않음)
export function buildSlots({ isInRoom, players, awaiting }) {
  if (isInRoom) {
    return players.map((player) => ({
      id: player.uuid,
      ready: Boolean(player.isReady),
      accountProfilePhotoId: player.accountProfilePhotoId,
      accountProfileBorderId: player.accountProfileBorderId,
    }))
  }
  void awaiting
  return []
}

// 한 줄에 columns개씩 끊음
export function chunkPlayerSlots(slots, columns = PLAYER_SLOT_COLUMNS) {
  const rows = []

  for (let index = 0; index < slots.length; index += columns) {
    rows.push(slots.slice(index, index + columns))
  }

  return rows
}
