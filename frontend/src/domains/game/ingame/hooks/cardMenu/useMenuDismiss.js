// 카드 메뉴 닫기 훅: 메뉴·카드 바깥을 누르거나 Escape면 닫음
// 카드 메뉴 훅(useInGamePlayerCardMenu)이 메뉴가 열려 있을 때만 붙임
import { useEffect } from "react"

export function useMenuDismiss(openPlayerId, { menuRef, anchorsRef, closeMenu }) {
  useEffect(() => {
    if (openPlayerId === null) return undefined
    // 메뉴 안이나 연 카드 안을 누른 건 무시
    const handleMouseDown = (event) => {
      const menuNode = menuRef.current
      if (menuNode && menuNode.contains(event.target)) return
      const anchorNode = anchorsRef.current.get(openPlayerId)
      if (anchorNode && anchorNode.contains(event.target)) return
      closeMenu()
    }
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return
      closeMenu()
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [openPlayerId, closeMenu])
}
