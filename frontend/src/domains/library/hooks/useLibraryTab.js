import { useState } from "react"
import { DEFAULT_LIBRARY_TAB } from "../constants/libraryTabs.js"

export function useLibraryTab(initialTab = DEFAULT_LIBRARY_TAB) {
  const [activeTabId, setActiveTabId] = useState(initialTab)

  return {
    activeTabId,
    setActiveTabId,
  }
}
