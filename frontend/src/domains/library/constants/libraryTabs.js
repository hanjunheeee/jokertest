import { LIBRARY_ASSETS } from "@/domains/library/constants/libraryAssets.js"

/** 기억의 서고 목차(탭) 정의 */
export const LIBRARY_TABS = {
  forbiddenRecords: {
    id: "forbiddenRecords",
    label: "금지된 기록",
    tocSrc: LIBRARY_ASSETS.tocForbiddenRecords,
    bookmarkSrc: LIBRARY_ASSETS.bookmarkForbiddenRecords,
  },
  invitedGuests: {
    id: "invitedGuests",
    label: "초대받은 자들",
    tocSrc: LIBRARY_ASSETS.tocInvitedGuests,
    bookmarkSrc: LIBRARY_ASSETS.bookmarkInvitedGuests,
  },
}

export const LIBRARY_TAB_LIST = [
  LIBRARY_TABS.forbiddenRecords,
  LIBRARY_TABS.invitedGuests,
]

export const DEFAULT_LIBRARY_TAB = LIBRARY_TABS.forbiddenRecords.id

/** id로 목차 정보를 찾습니다. */
export function getLibraryTab(tabId) {
  return LIBRARY_TAB_LIST.find((tab) => tab.id === tabId) ?? LIBRARY_TABS.forbiddenRecords
}

/** 현재 탭이 아닌 다른 목차를 반환합니다. */
export function getOtherLibraryTab(activeTabId) {
  return LIBRARY_TAB_LIST.find((tab) => tab.id !== activeTabId) ?? LIBRARY_TABS.invitedGuests
}
