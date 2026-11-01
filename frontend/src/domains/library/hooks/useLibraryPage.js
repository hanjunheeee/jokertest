// 서고 탭별 쪽 번호 기억·쪽 넘기기
// pages/LibraryPage.jsx가 씀
import { useState } from "react"
import { LIBRARY_TABS } from "../constants/libraryTabs.js"
import {
  FORBIDDEN_RECORDS_PAGE_COUNT,
} from "../content/index.js"

// 탭별 쪽 수: 초대받은 자들은 직업 탭으로 넘겨서 1쪽
export function getLibraryPageCount(activeTabId) {
  if (activeTabId === LIBRARY_TABS.invitedGuests.id) {
    return 1
  }
  return FORBIDDEN_RECORDS_PAGE_COUNT
}

// 탭마다 마지막 쪽 따로 기억 (처음은 0쪽)
export function useLibraryPage(activeTabId) {
  const [pageByTab, setPageByTab] = useState({})
  const pageCount = getLibraryPageCount(activeTabId)
  const pageIndex = pageByTab[activeTabId] ?? 0

  // 범위 밖 번호는 끝 쪽으로 맞춤, 다른 탭 쪽도 정할 수 있음
  const goToPage = (nextIndex, targetTabId = activeTabId) => {
    const targetPageCount = getLibraryPageCount(targetTabId)
    const safeIndex = Math.min(Math.max(nextIndex, 0), targetPageCount - 1)
    setPageByTab((prev) => ({ ...prev, [targetTabId]: safeIndex }))
  }

  // 다음 쪽 (마지막 쪽이면 그대로)
  const goNext = () => goToPage(pageIndex + 1)
  // 이전 쪽 (첫 쪽이면 그대로)
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
