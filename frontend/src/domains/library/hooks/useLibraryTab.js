// 서고 지금 탭 상태
// pages/LibraryPage.jsx가 씀
import { useState } from "react"
import { DEFAULT_LIBRARY_TAB } from "../constants/libraryTabs.js"

// 처음 탭은 금지된 기록, 알림으로 들어오면 화면이 바꿈
export function useLibraryTab(initialTab = DEFAULT_LIBRARY_TAB) {
  const [activeTabId, setActiveTabId] = useState(initialTab)

  return {
    activeTabId,
    setActiveTabId,
  }
}
