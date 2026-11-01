// 열린 동안 Esc 키로 닫기 (태블릿·키보드 연결 폰)
// FriendsSheet가 씀

import { useEffect, useRef } from "react"

// 닫기 함수는 ref로 들고 있어 그릴 때마다 키 구독을 다시 걸지 않음
export function useEscapeClose(open, onClose) {
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeRef.current?.()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open])
}
