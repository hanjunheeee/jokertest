// 낮은 화면에서 입력 중인지: 글 칸에 초점 + 보이는 높이(visualViewport, 키보드 뺀 높이)가 낮음
// InGamePage가 씀, 키보드가 올라오면 진행 바·세로 판을 접어 채팅 목록·입력 줄 자리를 냄
import { useEffect, useState } from "react"

// 이보다 낮으면 입력 중에 채팅 목록이 안 보여서 접음
const COMPACT_HEIGHT_PX = 600

// 글 넣는 칸에 초점이 있는지
function isTypingTarget(el) {
  if (!el) return false
  if (el.tagName === "TEXTAREA" || el.isContentEditable) return true
  return el.tagName === "INPUT" && !["checkbox", "radio", "range", "button", "submit"].includes(el.type)
}

// 보이는 높이 (iOS는 화면 높이를 안 줄이고 visualViewport만 줄어서 이걸 봄)
function visibleHeight() {
  return window.visualViewport?.height ?? window.innerHeight
}

// 키보드가 오르내리거나 초점이 바뀔 때마다 다시 잼
export function useCompactTyping() {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport
    const update = () => setCompact(isTypingTarget(document.activeElement) && visibleHeight() < COMPACT_HEIGHT_PX)
    update()
    vv?.addEventListener("resize", update)
    window.addEventListener("resize", update)
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)
    return () => {
      vv?.removeEventListener("resize", update)
      window.removeEventListener("resize", update)
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", update)
    }
  }, [])

  return compact
}
