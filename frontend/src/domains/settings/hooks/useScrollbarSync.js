import { useCallback, useLayoutEffect, useRef, useState } from "react"

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

export function useScrollbarSync(activeTab, visible) {
  const listRef = useRef(null)

  const [scrollbarBox, setScrollbarBox] = useState(null)

  const syncScrollbarHeight = useCallback(() => {
    const listEl = listRef.current
    if (!listEl || activeTab !== "general") {
      setScrollbarBox(null)
      return
    }
    setScrollbarBox(measureSettingRows(listEl))
  }, [activeTab])

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
