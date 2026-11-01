import { INVITED_GUESTS_JOB_CATALOG } from "./jobCatalog.js"
import { INVITED_GUESTS_JOB_CHALLENGES } from "./jobChallenges.js"
import {
  INVITED_GUESTS_JOB_SPREAD_META,
  INVITED_GUESTS_PAGE_COUNT,
} from "../../../../shared/constants/jobSpreadMeta.js"
import { mergeInvitedGuestsSpreads } from "./mergeInvitedGuestsSpreads.js"

export { INVITED_GUESTS_PAGE_COUNT }

export const INVITED_GUESTS_PAGES = mergeInvitedGuestsSpreads(
  INVITED_GUESTS_JOB_SPREAD_META,
  INVITED_GUESTS_JOB_CATALOG,
  INVITED_GUESTS_JOB_CHALLENGES,
)

export function getInvitedGuestsPage(pageIndex, jobState) {
  const safeIndex = Math.min(Math.max(pageIndex, 0), INVITED_GUESTS_PAGE_COUNT - 1)
  const pages = jobState
    ? mergeInvitedGuestsSpreads(
        INVITED_GUESTS_JOB_SPREAD_META,
        INVITED_GUESTS_JOB_CATALOG,
        INVITED_GUESTS_JOB_CHALLENGES,
        jobState,
      )
    : INVITED_GUESTS_PAGES
  return pages[safeIndex] ?? { ready: false }
}
