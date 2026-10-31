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

const toRankingRowDisplay = (entry) => ({
  rank: entry.rank,
  profileSrc:
    resolveAccountProfilePhotoSrc(entry.accountProfilePhotoId) ||
    entry.profile_image_url ||
    entry.profileSrc ||
    "/shopItem/player-profile/프로필-금빛가면.png",
  profileBorderSrc: resolveAccountProfileBorderSrc(entry.accountProfileBorderId),
  nickname: entry.nickname,
  playCount: entry.games,
  winRate: formatWinRate(entry.winRate),
})

export function mergeInvitedGuestsSpreads(spreadMeta, catalog, challenges, jobState = {}) {
  return spreadMeta.map(({ id, jobKey }) => {
    const job = catalog[jobKey]
    const jobChallenges = challenges[jobKey]

    if (!job || !jobChallenges?.length) {
      return { id, jobKey, ready: false }
    }

    const state = jobState.byJobKey?.[jobKey] ?? { status: "idle", myStats: null, ranking: null, error: null, achievementsById: {} }
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
            cleared: progress?.granted ?? false,
            current: progress?.current ?? null,
            threshold: progress?.threshold ?? null,
          }
        }),
      },
    }
  })
}
