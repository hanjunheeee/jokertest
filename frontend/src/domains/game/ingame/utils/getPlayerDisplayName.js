// 참가자 화면 이름 고르기
// 시험만 사용

// uuid가 없으면 없음, 명단에 없거나 별명이 없으면 알 수 없는 참가자
export function getPlayerDisplayName(players, uuid) {
  if (!uuid) return "없음"
  return players?.find((player) => player.uuid === uuid)?.nickname || "알 수 없는 참가자"
}
