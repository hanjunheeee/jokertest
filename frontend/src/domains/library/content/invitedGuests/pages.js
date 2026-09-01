import { INVITED_GUESTS_DEV_STATE } from "@/domains/library/content/invitedGuests/invitedGuestsDevState.js"
import { INVITED_GUESTS_JOB_CATALOG } from "@/domains/library/content/invitedGuests/jobCatalog.js"
import { INVITED_GUESTS_JOB_CHALLENGES } from "@/domains/library/content/invitedGuests/jobChallenges.js"
import {
  INVITED_GUESTS_JOB_SPREAD_META,
  INVITED_GUESTS_PAGE_COUNT,
} from "@/domains/library/content/invitedGuests/jobSpreadMeta.js"
import { mergeInvitedGuestsSpreads } from "@/domains/library/content/invitedGuests/mergeInvitedGuestsSpreads.js"

/** 초대받은 자들 — 책 spread 목록 (1 spread = 1직업) */
export const INVITED_GUESTS_PAGES = mergeInvitedGuestsSpreads(
  INVITED_GUESTS_JOB_SPREAD_META,
  INVITED_GUESTS_JOB_CATALOG,
  INVITED_GUESTS_JOB_CHALLENGES,
  INVITED_GUESTS_DEV_STATE,
)

export { INVITED_GUESTS_PAGE_COUNT }

/** spread index로 초대받은 자들 페이지를 가져옵니다. */
export function getInvitedGuestsPage(pageIndex) {
  const safeIndex = Math.min(Math.max(pageIndex, 0), INVITED_GUESTS_PAGE_COUNT - 1)
  return INVITED_GUESTS_PAGES[safeIndex] ?? { ready: false }
}
