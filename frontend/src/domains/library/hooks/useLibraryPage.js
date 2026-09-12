import { useState } from "react"
import { LIBRARY_TABS } from "../constants/libraryTabs.js"
import {
  FORBIDDEN_RECORDS_PAGE_COUNT,
} from "../content/index.js"

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

  /**
   * @param {number} nextIndex
   * @param {string} [targetTabId] 이 페이지를 기록할 목차. 생략하면 현재 목차다.
   *
   * F-17(AC-02): 목적 탭을 **명시할 수 있어야** 한다. 알림에서 들어올 때는
   * setActiveTabId(다른 탭)과 goToPage(그 탭의 페이지)를 같은 처리에서 함께 호출하는데,
   * 그때 이 함수가 클로저에 잡힌 activeTabId(= 아직 바뀌기 전 탭)를 쓰면 페이지 번호가
   * **이전 탭**에 기록된다 — 목적 탭은 0페이지로 열리고, 돌아온 이전 탭이 엉뚱한 페이지를
   * 보여준다. 상한도 그 탭의 페이지 수로 계산해야 한다(탭마다 페이지 수가 다르다).
   */
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
