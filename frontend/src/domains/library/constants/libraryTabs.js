import { LIBRARY_ASSETS } from "./libraryAssets.js"

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

export function getLibraryTab(tabId) {
  return LIBRARY_TAB_LIST.find((tab) => tab.id === tabId) ?? LIBRARY_TABS.forbiddenRecords
}

export function getOtherLibraryTab(activeTabId) {
  return LIBRARY_TAB_LIST.find((tab) => tab.id !== activeTabId) ?? LIBRARY_TABS.invitedGuests
}