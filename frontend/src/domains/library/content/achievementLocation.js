// 업적 id → 서고 어디(탭·쪽·직업 순번)에 있는지 찾기
// pages/LibraryPage.jsx가 알림으로 들어올 때 씀
import { LIBRARY_TABS } from "../constants/libraryTabs.js"
import { FORBIDDEN_RECORDS_SPREAD_META } from "./forbiddenRecords/spreadMeta.js"
import { INVITED_GUESTS_JOB_SPREAD_META } from "../../../shared/constants/jobSpreadMeta.js"
import { INVITED_GUESTS_JOB_CHALLENGES } from "./invitedGuests/jobChallenges.js"

// 불러올 때 한 번 만들어 둠
const LOCATIONS = new Map()

// 금지된 기록: 기록 id → 그 쪽 번호
FORBIDDEN_RECORDS_SPREAD_META.forEach((meta, index) => {
  LOCATIONS.set(meta.id, {
    tabId: LIBRARY_TABS.forbiddenRecords.id,
    pageIndex: index,
    jobIndex: null,
  })
})

// 초대받은 자들: 도전과제 id → 그 직업 순번 (쪽은 늘 0)
INVITED_GUESTS_JOB_SPREAD_META.forEach((meta, index) => {
  for (const challenge of INVITED_GUESTS_JOB_CHALLENGES[meta.jobKey] ?? []) {
    LOCATIONS.set(challenge.id, {
      tabId: LIBRARY_TABS.invitedGuests.id,
      pageIndex: 0,
      jobIndex: index,
    })
  }
})

// 빈 값·모르는 id면 null (화면 그대로 둠)
export function resolveAchievementLocation(achievementId) {
  if (typeof achievementId !== "string" || achievementId.length === 0) return null
  return LOCATIONS.get(achievementId) ?? null
}

// 아는 업적 id 전체 (알림 시험만 씀)
export const ACHIEVEMENT_LOCATION_IDS = [...LOCATIONS.keys()]
