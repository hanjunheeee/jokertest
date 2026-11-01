// 카드 주인이 나인지 보기
// 판 보드·카드 메뉴 계산이 사용

// 둘 다 빈칸 아닌 글자이고 같아야 나 (빈 id끼리 같다고 나로 보지 않게)
export function isInGameSelfPlayer(playerId, localPlayerId) {
  return (
    typeof playerId === "string" &&
    playerId.length > 0 &&
    typeof localPlayerId === "string" &&
    localPlayerId.length > 0 &&
    playerId === localPlayerId
  )
}
