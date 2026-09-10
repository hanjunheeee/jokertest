import { INVITED_GUESTS_JOB_CATALOG } from "./jobCatalog.js"
import { INVITED_GUESTS_JOB_CHALLENGES } from "./jobChallenges.js"
import {
  INVITED_GUESTS_JOB_SPREAD_META,
  INVITED_GUESTS_PAGE_COUNT,
} from "./jobSpreadMeta.js"
import { mergeInvitedGuestsSpreads } from "./mergeInvitedGuestsSpreads.js"

export { INVITED_GUESTS_PAGE_COUNT }

// F-10 AC-06: 예전에는 [DEV] 더미(INVITED_GUESTS_DEV_STATE)를 모듈 로딩 시점에 한 번 합쳐
// 실서비스 경로에서도 그대로 내보냈다. 이제 직업별 내 전적·랭킹은 계정마다 다른 런타임
// 값이라 import 시점에 고정할 수 없다 — jobState(roleStatistics.store.js 구독 결과)를
// 매 호출마다 받아 그 자리에서 합친다.
//
// jobState 없이 부르면(=INVITED_GUESTS_PAGES) 소개·도전과제 등 정적 내용만 채워지고
// 전적·랭킹은 idle(빈) 상태로 남는다 — 더미로 대체하지 않는다.
export const INVITED_GUESTS_PAGES = mergeInvitedGuestsSpreads(
  INVITED_GUESTS_JOB_SPREAD_META,
  INVITED_GUESTS_JOB_CATALOG,
  INVITED_GUESTS_JOB_CHALLENGES,
)

/**
 * spread index로 초대받은 자들 페이지를 가져옵니다.
 * @param {number} pageIndex
 * @param {object} [jobState] - roleStatistics.store.js의 런타임 전적·랭킹 상태(byJobKey 등).
 */
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
