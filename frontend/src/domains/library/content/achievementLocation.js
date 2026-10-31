import { LIBRARY_TABS } from "../constants/libraryTabs.js"
import { FORBIDDEN_RECORDS_SPREAD_META } from "./forbiddenRecords/spreadMeta.js"
import { INVITED_GUESTS_JOB_SPREAD_META } from "./invitedGuests/jobSpreadMeta.js"
import { INVITED_GUESTS_JOB_CHALLENGES } from "./invitedGuests/jobChallenges.js"

const LOCATIONS = new Map()

FORBIDDEN_RECORDS_SPREAD_META.forEach((meta, index) => {
  LOCATIONS.set(meta.id, {
    tabId: LIBRARY_TABS.forbiddenRecords.id,
    pageIndex: index,
    jobIndex: null,
  })
})

INVITED_GUESTS_JOB_SPREAD_META.forEach((meta, index) => {
  for (const challenge of INVITED_GUESTS_JOB_CHALLENGES[meta.jobKey] ?? []) {
    LOCATIONS.set(challenge.id, {
      tabId: LIBRARY_TABS.invitedGuests.id,
      pageIndex: 0,
      jobIndex: index,
    })
  }
})

export function resolveAchievementLocation(achievementId) {
  if (typeof achievementId !== "string" || achievementId.length === 0) return null
  return LOCATIONS.get(achievementId) ?? null
}

export const ACHIEVEMENT_LOCATION_IDS = [...LOCATIONS.keys()]
