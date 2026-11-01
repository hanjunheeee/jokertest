// 설정 목록 그림 스크롤바 위치·길이 맞추기 (첫 줄~마지막 줄 재기)
// components/SettingContentArea.jsx가 씀
import { useCallback, useLayoutEffect, useRef, useState } from "react"

// data-setting-row 줄들의 첫 줄 위~마지막 줄 아래 재기, 줄 없으면 null
function measureSettingRows(listEl) {
  const rows = listEl.querySelectorAll("[data-setting-row]")
  if (!rows.length) return null

  const wrapRect = listEl.getBoundingClientRect()
  const firstRect = rows[0].getBoundingClientRect()
  const lastRect = rows[rows.length - 1].getBoundingClientRect()

  return {
    top: firstRect.top - wrapRect.top,
    height: lastRect.bottom - firstRect.top,
  }
}

// 목록·창 크기 바뀔 때마다 다시 재서 스크롤바 칸 정함
export function useScrollbarSync(activeTab, visible) {
  const listRef = useRef(null)

  const [scrollbarBox, setScrollbarBox] = useState(null)

  // 일반 탭만 줄 기준으로 맞춤, 그 밖은 null (스크롤바가 칸 높이 전체)
  const syncScrollbarHeight = useCallback(() => {
    const listEl = listRef.current
    if (!listEl || activeTab !== "general") {
      setScrollbarBox(null)
      return
    }
    setScrollbarBox(measureSettingRows(listEl))
  }, [activeTab])

  // 그리기 전에 한 번 재고, 목록·창 크기 바뀌거나 창이 보이면 다시 잼
  useLayoutEffect(() => {
    syncScrollbarHeight()
    const listEl = listRef.current
    if (!listEl) return undefined

    const observer = new ResizeObserver(() => syncScrollbarHeight())
    observer.observe(listEl)
    window.addEventListener("resize", syncScrollbarHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncScrollbarHeight)
    }
  }, [syncScrollbarHeight, visible])

  return { listRef, scrollbarBox }
}
