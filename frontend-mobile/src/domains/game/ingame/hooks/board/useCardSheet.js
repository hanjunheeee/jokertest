// 카드 시트 상태: 데스크톱 카드 메뉴 훅의 열린 카드·항목을 그대로 시트에 넘김
// Board가 씀 (열기 조건·고르기·제출 대기·범위 바뀌면 닫기·바깥 누름 닫기 전부 데스크톱 useInGamePlayerCardMenu)
import { useInGamePlayerCardMenu } from "@/domains/game/ingame/hooks/useInGamePlayerCardMenu.js"

// 항목 없는 카드는 데스크톱처럼 안 열림, 같은 카드 다시 누르면 닫힘
export function useCardSheet() {
    const { openPlayerId, openMenu, closeMenu, getItems, registerAnchor, menuRef } = useInGamePlayerCardMenu()
    const items = openPlayerId === null ? [] : getItems(openPlayerId)

    return { targetId: openPlayerId, items, open: openMenu, close: closeMenu, registerAnchor, menuRef }
}
