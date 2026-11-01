// 카드 시트 상태: 탭한 카드·시트 항목(데스크톱 카드 메뉴 항목 + 방장 추방)·열기·닫기
// Board가 씀 (고르기·제출 대기·범위 닫기는 데스크톱 useInGamePlayerCardMenu가 그대로 맡음)
import { useCallback, useContext, useState } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useInGamePlayerCardMenu } from "@/domains/game/ingame/hooks/useInGamePlayerCardMenu.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { buildInGamePlayerCardMenuItems } from "@/domains/game/ingame/utils/playerCardMenu.js"
import { selectInGameNightTurnRole } from "@/domains/game/ingame/utils/nightTurn.js"
import { buildKickItem } from "./sheetExtras.js"

// 시트를 연 뒤 바뀌면 닫는 범위 (판·단계·날짜·밤 차례·조작 막힘)
function buildScopeKey(gameId, gameState, interactionBlocked) {
    return [
        gameId, gameState?.phase, gameState?.dayPhase, gameState?.dayIndex,
        selectInGameNightTurnRole(gameState), interactionBlocked,
    ].join("|")
}

// 시트 열림·항목과 열기·닫기·카드 노드 등록
export function useCardSheet() {
    const ctx = useContext(InGameActionContext)
    const { localPlayerId } = useInGamePlayerSessionContext()
    const cardMenu = useInGamePlayerCardMenu()
    const { closeMenu, openMenu, getItems, registerAnchor, menuRef, openPlayerId } = cardMenu
    const gameId = useInGameStore((s) => s.gameId)
    const gameState = useInGameStore((s) => s.state)
    const storeHostUuid = useInGameStore((s) => s.hostUuid ?? null)
    const interactionBlocked = Boolean(ctx?.interactionBlocked)
    const scopeKey = buildScopeKey(gameId, gameState, interactionBlocked)

    // 연 카드·연 범위·데스크톱 메뉴가 같이 열렸는지 (effect 없이 아래에서 열림을 계산)
    const [opened, setOpened] = useState(null)

    const close = useCallback(() => {
        setOpened(null)
        closeMenu()
    }, [closeMenu])

    // 조작 막힘(연출 중)이면 안 엶, 항목이 있으면 데스크톱 메뉴도 같이 엶
    const open = useCallback((playerId) => {
        if (interactionBlocked) return
        const attached = buildInGamePlayerCardMenuItems(ctx, playerId, localPlayerId).length > 0
        setOpened({ playerId, scopeKey, attached })
        if (attached && openPlayerId !== playerId) openMenu(playerId)
    }, [ctx, interactionBlocked, localPlayerId, openMenu, openPlayerId, scopeKey])

    // 범위가 바뀌었거나, 같이 연 데스크톱 메뉴가 닫혔으면(고른 뒤·바깥 누름·Esc) 시트도 닫힌 것으로 봄
    const isOpen = opened !== null
        && opened.scopeKey === scopeKey
        && (!opened.attached || openPlayerId === opened.playerId)
    const targetId = isOpen ? opened.playerId : null

    // 데스크톱 메뉴 항목 + 방장 추방 (추방은 시트 닫고 컨텍스트의 추방 확인을 엶)
    const menuItems = isOpen && opened.attached ? getItems(targetId) : []
    const targetRow = (gameState?.players ?? []).find((row) => row?.uuid === targetId) ?? null
    const kickItem = isOpen
        ? buildKickItem({ ctx, hostUuid: ctx?.hostUuid ?? storeHostUuid, localPlayerId, targetId, targetRow })
        : null
    const items = kickItem
        ? [...menuItems, { ...kickItem, onSelect: () => { close(); ctx.requestConfirmByUuid(targetId) } }]
        : menuItems

    return { targetId, items, open, close, registerAnchor, menuRef }
}
