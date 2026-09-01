import { useState } from "react"
import { LIBRARY_TABS } from "@/domains/library/constants/libraryTabs.js"
import {
  FORBIDDEN_RECORDS_PAGE_COUNT,
} from "@/domains/library/content/index.js"

/** 목차(탭)별 spread 페이지 수 */
export function getLibraryPageCount(activeTabId) {
  if (activeTabId === LIBRARY_TABS.invitedGuests.id) {
    return 1
  }
  return FORBIDDEN_RECORDS_PAGE_COUNT
}

/** 기억의 서고 — 현재 spread 페이지 index */
export function useLibraryPage(activeTabId) {
  const [pageByTab, setPageByTab] = useState({})
  const pageCount = getLibraryPageCount(activeTabId)
  const pageIndex = pageByTab[activeTabId] ?? 0

  const goToPage = (nextIndex) => {
    const safeIndex = Math.min(Math.max(nextIndex, 0), pageCount - 1)
    setPageByTab((prev) => ({ ...prev, [activeTabId]: safeIndex }))
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
