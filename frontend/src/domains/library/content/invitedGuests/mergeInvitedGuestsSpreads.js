import { INVITED_GUESTS_MASTERY_RANKING_LIMIT } from "@/domains/library/content/invitedGuests/jobSpreadMeta.js"

const INVITED_GUESTS_DEV_FALLBACK_JOB_KEY = "noble"

/**
 * @param {{ id: string, jobKey: string }[]} spreadMeta
 * @param {Record<string, object>} catalog
 * @param {Record<string, object[]>} challenges
 * @param {{ myStats: Record<string, object>, ranking: Record<string, object[]> }} devState
 */
export function mergeInvitedGuestsSpreads(spreadMeta, catalog, challenges, devState) {
  return spreadMeta.map(({ id, jobKey }) => {
    const job = catalog[jobKey]
    const jobChallenges = challenges[jobKey]
    const myStats =
      devState.myStats[jobKey] ?? devState.myStats[INVITED_GUESTS_DEV_FALLBACK_JOB_KEY]
    const ranking =
      devState.ranking[jobKey] ?? devState.ranking[INVITED_GUESTS_DEV_FALLBACK_JOB_KEY]
    const clearedChallengeIds = new Set(devState.clearedChallengeIds?.[jobKey] ?? [])

    if (!job || !jobChallenges?.length || !myStats || !ranking) {
      return { id, jobKey, ready: false }
    }

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
        myStats,
      },
      right: {
        ranking: ranking.slice(0, INVITED_GUESTS_MASTERY_RANKING_LIMIT),
        challenges: jobChallenges.map((challenge) => ({
          ...challenge,
          cleared: clearedChallengeIds.has(challenge.id),
        })),
      },
    }
  })
}
