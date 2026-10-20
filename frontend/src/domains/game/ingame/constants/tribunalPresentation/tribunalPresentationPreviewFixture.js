import { buildInGamePreviewPlayers } from "../../utils/buildInGamePreviewPlayers.js"

/** dev 프리뷰 — 피고(defendant) 플레이어 카드 데이터 */
export function buildTribunalPresentationPreviewDefendant() {
  const players = buildInGamePreviewPlayers(5)
  return players[1]
}

/** dev 프리뷰 — split 이후 채팅 패널 더미 메시지 */
export function buildTribunalPresentationPreviewChatMessages() {
  const players = buildInGamePreviewPlayers(5)
  const now = Date.now()

  return [
    {
      id: "tribunal-preview-1",
      playerId: players[0].id,
      senderName: players[0].nickname,
      text: "최후의 반론, 각자 의견을 말해 주세요.",
      sentAt: now - 120_000,
    },
    {
      id: "tribunal-preview-2",
      playerId: players[2].id,
      senderName: players[2].nickname,
      text: "저는 무죄라고 봅니다. 증거가 부족해요.",
      sentAt: now - 75_000,
    },
    {
      id: "tribunal-preview-3",
      playerId: players[3].id,
      senderName: players[3].nickname,
      text: "어제 밤 행동과 맞지 않는 부분이 있어요.",
      sentAt: now - 30_000,
    },
  ]
}
