// 설정 목록 그림 스크롤바 위치·길이 맞추기 (첫 줄~마지막 줄 재기)
// components/SettingContentArea.jsx가 씀
import { useCallback, useLayoutEffect, useRef, useState } from "react"

// data-setting-row 줄들의 첫 줄 위~마지막 줄 아래 재기, 줄 없으면 null
export function measureSettingRows(listEl) {
  const rows = listEl.querySelectorAll("[data-setting-row]")
  if (!rows.length) return null

  const wrapRect = listEl.getBoundingClientRect()
  const firstRect = rows[0].getBoundingClientRect()
  const lastRect = rows[rows.length - 1].getBoundingClientRect()

  // 스크롤된 만큼 더해 내용 기준으로 잼 (스크롤된 채 창 크기가 바뀌면 막대가 위로 밀리던 것)
  return {
    top: firstRect.top - wrapRect.top + (listEl.scrollTop || 0),
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

    // 목록 칸뿐 아니라 줄마다도 봄 (줄 높이만 바뀌면 목록 칸 크기는 그대로라 못 따라갔음)
    const observer = new ResizeObserver(() => syncScrollbarHeight())
    observer.observe(listEl)
    for (const row of listEl.querySelectorAll("[data-setting-row]")) observer.observe(row)
    window.addEventListener("resize", syncScrollbarHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncScrollbarHeight)
    }
  }, [syncScrollbarHeight, visible])

  return { listRef, scrollbarBox }
}
