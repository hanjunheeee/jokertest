import { useState } from "react"
import { DEFAULT_LIBRARY_TAB } from "@/domains/library/constants/libraryTabs.js"

/** 기억의 서고 목차(탭) 전환 상태 */
export function useLibraryTab(initialTab = DEFAULT_LIBRARY_TAB) {
  const [activeTabId, setActiveTabId] = useState(initialTab)

  return {
    activeTabId,
    setActiveTabId,
  }
}
