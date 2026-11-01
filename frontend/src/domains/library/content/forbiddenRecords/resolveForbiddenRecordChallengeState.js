// 금지된 기록 도전 상태 계산 (깼는지·진행도 글자)
// forbiddenRecords/ForbiddenRecordsRightPage.jsx가 씀, 시험도 직접 불러 봄

// 깼음은 보상 받음(granted) 기준으로 봄
export function resolveForbiddenRecordChallengeState({ achievement, status, error, unlockProgress, progressUnit }) {
  const challengeCleared = achievement?.granted ?? false;
  // 진행도: 업적 있음 → 현재/목표, 불러오는 중·실패 문구, 그 밖은 예시 글자
  const displayedProgress = achievement
    ? `${Math.min(achievement.current, achievement.threshold)}/${achievement.threshold}${progressUnit ?? ""}`
    : status === "loading"
      ? "진행률을 불러오는 중…"
      : status === "error"
        ? (error ?? "진행률을 불러오지 못했습니다")
        : unlockProgress;
  return { challengeCleared, displayedProgress };
}
