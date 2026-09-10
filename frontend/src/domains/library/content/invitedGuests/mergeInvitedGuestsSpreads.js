// 정적 소개(catalog)·도전과제(challenges)와 런타임 직업 전적·랭킹(jobState)을 합쳐 화면이
// 그대로 쓸 수 있는 spread 목록을 만든다.
//
// F-10 AC-03/AC-06: 예전 버전은 다른 직업 데이터가 없으면 noble(귀족) 더미로 대체했고
// 랭킹을 INVITED_GUESTS_MASTERY_RANKING_LIMIT로 잘랐다 — 둘 다 실서비스 더미였다. 지금은
// jobKey마다 자기 자신의 런타임 상태만 쓰고(다른 직업으로 대체하지 않는다), 랭킹은 서버가
// 돌려준 전체 목록을 그대로 넘긴다(화면 내 페이지 이동은 InvitedGuestsMasteryRanking의 몫).

const formatWinRate = (winRate) => `${Math.round((winRate ?? 0) * 100)}%`

const toMyStatsDisplay = (myStats) => myStats && {
  playCount: myStats.games,
  winRate: formatWinRate(myStats.winRate),
  survivalCount: myStats.survivalCount,
}

const toRankingRowDisplay = (entry) => ({
  rank: entry.rank,
  profileSrc: entry.profile_image_url || entry.profileSrc || "/shopItem/player-profile/프로필-금빛가면.png",
  // 프로필 테두리는 상점 소유품(F-08 영역)이라 직업 전적 API가 내려주지 않는다 — 없으면
  // InvitedGuestsRankingProfile이 테두리 없이 그린다.
  profileBorderSrc: null,
  nickname: entry.nickname,
  playCount: entry.games,
  winRate: formatWinRate(entry.winRate),
})

/**
 * @param {{ id: string, jobKey: string }[]} spreadMeta
 * @param {Record<string, object>} catalog
 * @param {Record<string, object[]>} challenges
 * @param {{
 *   byJobKey?: Record<string, { status: 'idle'|'loading'|'success'|'error', myStats: object|null, ranking: object[]|null, error: string|null, achievementsById?: Record<string, { achieved: boolean, current: number, threshold: number }> }>,
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
            cleared: progress?.achieved ?? false,
            current: progress?.current ?? null,
            threshold: progress?.threshold ?? null,
          }
        }),
      },
    }
  })
}
