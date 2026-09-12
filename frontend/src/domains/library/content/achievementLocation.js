/**
 * F-17(AC-02): 업적 id → 기억의 서고에서 그 업적이 있는 위치.
 *
 * 알림의 target({kind:'achievement', achievementId})이 여는 곳을 정하는 **허용 목록**이다.
 * 서버 정의(backend/services/achievementDefinitions.js)의 22개 id와 같은 출처를 쓰되,
 * 프런트 쪽 정의 파일을 직접 읽어 만든다 — 두 파일이 어긋나면 시험이 잡는다.
 *
 * 모르는 id는 null이다. 화면은 그때 탭·페이지를 바꾸지 않는다(임의 입력이 서고의 어느
 * 페이지든 열 수 있는 통로가 되면 안 된다).
 *
 * 금지된 기록 쪽은 FORBIDDEN_RECORDS_SPREAD_META를 쓴다(FORBIDDEN_RECORDS_PAGES가 아니라).
 * pages.js는 `.md?raw` import 때문에 Vite에서만 해석되는데, 이 매핑은 변환기 없이 도는
 * node --test가 그대로 검증할 수 있어야 하기 때문이다. 실제 페이지 id와의 대조는 그 값을
 * 실제로 읽는 ForbiddenRecordsRightPage가 렌더 시점에 한다.
 */
import { LIBRARY_TABS } from "../constants/libraryTabs.js"
import { FORBIDDEN_RECORDS_SPREAD_META } from "./forbiddenRecords/spreadMeta.js"
import { INVITED_GUESTS_JOB_SPREAD_META } from "./invitedGuests/jobSpreadMeta.js"
import { INVITED_GUESTS_JOB_CHALLENGES } from "./invitedGuests/jobChallenges.js"

const LOCATIONS = new Map()

// 금지된 기록: spread 하나가 업적 하나다 → pageIndex가 곧 그 업적의 페이지다.
FORBIDDEN_RECORDS_SPREAD_META.forEach((meta, index) => {
  LOCATIONS.set(meta.id, {
    tabId: LIBRARY_TABS.forbiddenRecords.id,
    pageIndex: index,
    jobIndex: null,
  })
})

// 초대받은 자들: spread 하나가 직업 하나다(페이지는 1개뿐) → jobIndex로 직업을 고른다.
INVITED_GUESTS_JOB_SPREAD_META.forEach((meta, index) => {
  for (const challenge of INVITED_GUESTS_JOB_CHALLENGES[meta.jobKey] ?? []) {
    LOCATIONS.set(challenge.id, {
      tabId: LIBRARY_TABS.invitedGuests.id,
      pageIndex: 0,
      jobIndex: index,
    })
  }
})

/**
 * @param {unknown} achievementId
 * @returns {{tabId: string, pageIndex: number, jobIndex: number|null}|null}
 */
export function resolveAchievementLocation(achievementId) {
  if (typeof achievementId !== "string" || achievementId.length === 0) return null
  return LOCATIONS.get(achievementId) ?? null
}

/** 시험이 22개 전부를 대조할 수 있게 내보낸다. */
export const ACHIEVEMENT_LOCATION_IDS = [...LOCATIONS.keys()]
