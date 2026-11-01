// 대기방 자리 계산: 방 상태로 자리 목록 만들기·자리를 줄로 나누기
// useMatchingPage·PlayerSlotGrid·MatchingPartySlots가 씀
import { PARTY_SLOTS_DUMMY_10 } from "../constants/gameMatchingAssets.js"

// 한 줄 칸 수
export const PLAYER_SLOT_COLUMNS = 5

// 방에 있으면 사람 자리, 파티 방 기다리는 중이면 빈 목록, 그 밖엔 미리보기용 가짜 자리
export function buildSlots({ isInRoom, players, awaiting }) {
  if (isInRoom) {
    return players.map((player) => ({
      id: player.uuid,
      ready: Boolean(player.isReady),
      accountProfilePhotoId: player.accountProfilePhotoId,
      accountProfileBorderId: player.accountProfileBorderId,
    }))
  }
  return awaiting ? [] : PARTY_SLOTS_DUMMY_10
}

// 한 줄에 columns개씩 끊음
export function chunkPlayerSlots(slots, columns = PLAYER_SLOT_COLUMNS) {
  const rows = []

  for (let index = 0; index < slots.length; index += columns) {
    rows.push(slots.slice(index, index + columns))
  }

  return rows
}
