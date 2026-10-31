import { useState } from "react"
import { LIBRARY_TABS } from "../constants/libraryTabs.js"
import {
  FORBIDDEN_RECORDS_PAGE_COUNT,
} from "../content/index.js"

export function getLibraryPageCount(activeTabId) {
  if (activeTabId === LIBRARY_TABS.invitedGuests.id) {
    return 1
  }
  return FORBIDDEN_RECORDS_PAGE_COUNT
}

export function useLibraryPage(activeTabId) {
  const [pageByTab, setPageByTab] = useState({})
  const pageCount = getLibraryPageCount(activeTabId)
  const pageIndex = pageByTab[activeTabId] ?? 0

  const goToPage = (nextIndex, targetTabId = activeTabId) => {
    const targetPageCount = getLibraryPageCount(targetTabId)
    const safeIndex = Math.min(Math.max(nextIndex, 0), targetPageCount - 1)
    setPageByTab((prev) => ({ ...prev, [targetTabId]: safeIndex }))
  }

  const goNext = () => goToPage(pageIndex + 1)
  const goPrev = () => goToPage(pageIndex - 1)

  return {
    pageIndex,
    pageCount,
    goToPage,
    goNext,
    goPrev,
    canGoNext: pageIndex < pageCount - 1,
    canGoPrev: pageIndex > 0,
  }
}
