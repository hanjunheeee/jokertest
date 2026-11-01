// 서고 두 탭 정보 (id·이름·목차 그림·책갈피 그림)와 탭 찾기
// 서고 탭·쪽 훅, book/ 컴포넌트, achievementLocation.js가 씀
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

// 탭 차례 (금지된 기록 먼저)
export const LIBRARY_TAB_LIST = [
  LIBRARY_TABS.forbiddenRecords,
  LIBRARY_TABS.invitedGuests,
]

// 처음 열면 금지된 기록
export const DEFAULT_LIBRARY_TAB = LIBRARY_TABS.forbiddenRecords.id

// id로 탭 찾기, 모르는 id면 금지된 기록
export function getLibraryTab(tabId) {
  return LIBRARY_TAB_LIST.find((tab) => tab.id === tabId) ?? LIBRARY_TABS.forbiddenRecords
}

// 지금 탭 말고 다른 탭 (시험만 씀)
export function getOtherLibraryTab(activeTabId) {
  return LIBRARY_TAB_LIST.find((tab) => tab.id !== activeTabId) ?? LIBRARY_TABS.invitedGuests
}