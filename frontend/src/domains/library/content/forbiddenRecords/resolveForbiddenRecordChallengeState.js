export function resolveForbiddenRecordChallengeState({ achievement, status, error, unlockProgress, progressUnit }) {
  const challengeCleared = achievement?.granted ?? false;
  const displayedProgress = achievement
    ? `${Math.min(achievement.current, achievement.threshold)}/${achievement.threshold}${progressUnit ?? ""}`
    : status === "loading"
      ? "진행률을 불러오는 중…"
      : status === "error"
        ? (error ?? "진행률을 불러오지 못했습니다")
        : unlockProgress;
  return { challengeCleared, displayedProgress };
}
