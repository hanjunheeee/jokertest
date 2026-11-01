// 카드 시트 덧붙임 항목: 방장 추방 (F-34 설계의 카드 추방 항목, 행동 컨텍스트 함수로 엶)
// useCardSheet가 씀 (투표·재판·밤 항목은 데스크톱 buildInGamePlayerCardMenuItems 그대로)

export const KICK_ITEM_KIND = "KICK"
export const KICK_LABEL = "추방"
const KICK_SENDING_REASON = "추방 요청을 보내는 중입니다"

// 내가 방장이고, 남의 카드이고, 판에 남아 있고, 컨텍스트에 추방 열기가 있을 때만
export function buildKickItem({ ctx, hostUuid, localPlayerId, targetId, targetRow }) {
    if (!ctx || typeof ctx.requestConfirmByUuid !== "function") return null
    if (ctx.gameState?.phase === "ENDED") return null
    if (!localPlayerId || hostUuid !== localPlayerId) return null
    if (!targetId || targetId === localPlayerId) return null
    if (!targetRow || targetRow.isParticipating === false) return null
    const enabled = ctx.isSending !== true
    return {
        kind: KICK_ITEM_KIND,
        label: KICK_LABEL,
        visible: true,
        enabled,
        disabledReason: enabled ? null : KICK_SENDING_REASON,
    }
}
