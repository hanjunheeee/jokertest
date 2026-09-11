// 정적 소개(catalog)·도전과제(challenges)와 런타임 직업 전적·랭킹(jobState)을 합쳐 화면이
// 그대로 쓸 수 있는 spread 목록을 만든다.
//
// F-10 AC-03/AC-06: 예전 버전은 다른 직업 데이터가 없으면 noble(귀족) 더미로 대체했고
// 랭킹을 INVITED_GUESTS_MASTERY_RANKING_LIMIT로 잘랐다 — 둘 다 실서비스 더미였다. 지금은
// jobKey마다 자기 자신의 런타임 상태만 쓰고(다른 직업으로 대체하지 않는다), 랭킹은 서버가
// 돌려준 전체 목록을 그대로 넘긴다(화면 내 페이지 이동은 InvitedGuestsMasteryRanking의 몫).
import {
  resolveAccountProfileBorderSrc,
  resolveAccountProfilePhotoSrc,
} from "../../../../shared/utils/resolveAccountProfileAssets.js"

const formatWinRate = (winRate) => `${Math.round((winRate ?? 0) * 100)}%`

const toMyStatsDisplay = (myStats) => myStats && {
  playCount: myStats.games,
  winRate: formatWinRate(myStats.winRate),
  survivalCount: myStats.survivalCount,
}

// F-13 AC-05(운영자 확장 승인): gameResult.repositories.js의 getRoleRanking이 이제
// economyService.getPublicProfileLoadouts로 조회한 accountProfilePhotoId/accountProfileBorderId를
// 함께 내려준다 — 실제 장착 사진·테두리가 있으면 그것을 쓰고, 없으면 기존처럼 legacy
// profile_image_url(경제 이전 계정의 구 프로필)·하드코딩 기본 사진으로 대체한다. 순위·승률
// 등 다른 필드는 전혀 건드리지 않는다.
const toRankingRowDisplay = (entry) => ({
  rank: entry.rank,
  profileSrc:
    resolveAccountProfilePhotoSrc(entry.accountProfilePhotoId) ||
    entry.profile_image_url ||
    entry.profileSrc ||
    "/shopItem/player-profile/프로필-금빛가면.png",
  // 실제 장착 테두리가 없으면(미보유·구 계정) null로 남겨 기존처럼 테두리 없이 그린다
  // (InvitedGuestsRankingProfile은 profileBorderSrc가 없으면 렌더하지 않는다).
  profileBorderSrc: resolveAccountProfileBorderSrc(entry.accountProfileBorderId),
  nickname: entry.nickname,
  playCount: entry.games,
  winRate: formatWinRate(entry.winRate),
})

/**
 * @param {{ id: string, jobKey: string }[]} spreadMeta
 * @param {Record<string, object>} catalog
 * @param {Record<string, object[]>} challenges
 * @param {{
 *   byJobKey?: Record<string, { status: 'idle'|'loading'|'success'|'error', myStats: object|null, ranking: object[]|null, error: string|null, achievementsById?: Record<string, { achieved: boolean, current: number, threshold: number, granted: boolean }> }>,
 * }} [jobState]
 */
export function mergeInvitedGuestsSpreads(spreadMeta, catalog, challenges, jobState = {}) {
  return spreadMeta.map(({ id, jobKey }) => {
    const job = catalog[jobKey]
    const jobChallenges = challenges[jobKey]

    // 정적 소개·도전과제 정의가 아예 없는 건 직업 카탈로그 데이터 문제다 — API 로딩 상태와
    // 무관하게 이 spread 자체를 그릴 수 없다.
    if (!job || !jobChallenges?.length) {
      return { id, jobKey, ready: false }
    }

    const state = jobState.byJobKey?.[jobKey] ?? { status: "idle", myStats: null, ranking: null, error: null, achievementsById: {} }
    // F-12 AC-01/AC-06: 도전과제 id는 그대로 achievementDefinitions.js의 업적 id다
    // (noble-win-10 등) — roleStatistics.store.js가 직업 전적과 함께 불러온 업적 진행률에서
    // 클리어 여부와 현재값·임계값을 함께 읽는다. CODEX-1 재검토(AC-01): cleared 불리언만
    // 남기지 않고 current·threshold도 그대로 전달해, 화면이 실제 진행률을 표시할 수 있게
    // 한다(더 이상 항상 빈 값으로 남는 더미가 아니다).
    const achievementsById = state.achievementsById ?? {}
    // CODEX-2 재검토(AC-06): cleared는 achieved(진행률 조건 충족)가 아니라 granted(실제
    // 지급 이력)로 판정한다 — 조건은 채웠지만 보상 지급이 아직 실패/지연된 상태를 "클리어"로
    // 잘못 보여주면 재로그인 후 실제 지급 상태와 화면이 어긋난다(테두리 소유도 granted가
    // true일 때만 실제로 존재한다).

    return {
      id,
      jobKey,
      ready: true,
      left: {
        jobName: job.jobName,
        description: job.description,
        standingImage: job.standingImage,
        standingImageClass: job.standingImageClass,
        standingImageWrapClass: job.standingImageWrapClass,
        statsStatus: state.status,
        statsError: state.error,
        myStats: toMyStatsDisplay(state.myStats),
      },
      right: {
        rankingStatus: state.status,
        rankingError: state.error,
        ranking: state.ranking?.map(toRankingRowDisplay) ?? null,
        challenges: jobChallenges.map((challenge) => {
          const progress = achievementsById[challenge.id]
          return {
            ...challenge,
            cleared: progress?.granted ?? false,
            current: progress?.current ?? null,
            threshold: progress?.threshold ?? null,
          }
        }),
      },
    }
  })
}
