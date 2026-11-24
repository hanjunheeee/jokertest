// /game-matching에 그대로 있어도 되는지: 첫 방 확인 기다림(새로고침 등) or 실제로 방에 앉아 있음
// roomLocalTrustUntil: 결과→대기방·방 만들기 직후 서버 확인 전까지 목록으로 튕기지 않게
export function canStayOnMatchingPage({
  awaiting, isInRoom, roomId, players, myUuid, roomLocalTrustUntil = 0,
}) {
  if (awaiting) return true
  if (roomLocalTrustUntil > Date.now()) return true
  if (!isInRoom || typeof roomId !== 'string' || roomId.length === 0) return false
  if (typeof myUuid !== 'string' || myUuid.length === 0) return false
  return (players ?? []).some((player) => player?.uuid === myUuid)
}