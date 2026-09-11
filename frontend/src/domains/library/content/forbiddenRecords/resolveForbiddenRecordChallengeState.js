// F-12 AC-01/AC-06: ForbiddenRecordsRightPage.jsx가 서버 업적 상태로 challengeCleared·
// displayedProgress를 계산하는 로직을 순수 함수로 뽑아낸다. 이 저장소의 테스트는 node --test로
// 돌고 JSX를 변환하지 않으므로(frontend/package.json의 test 스크립트) .jsx 파일은 실제로
// import·실행할 수 없다 — InGameParchmentModalBase.js/InGamePhaseEntranceOverlay.js가 이미
// 쓰는 관례(표시 로직을 JSX 없는 .js로 뽑아 실제 실행으로 검증한다)를 그대로 따른다. 이
// 함수를 실제 FORBIDDEN_RECORDS_SPREAD_META(7개) 위에서 직접 실행하면, 22개 업적(기록 7 +
// 직업 도전과제 15) 전부의 원문·클리어 판정이 소스 문자열 검사가 아니라 실제 실행으로
// 보존되는지 확인할 수 있다.
//
// CODEX-2 재검토(AC-06): cleared는 achieved(진행률 조건 충족)가 아니라 granted(실제 지급
// 이력)로 판정한다 — 지급이 아직 실패·지연된 상태를 "클리어"로 보여주면 재로그인 후 실제
// 지급 상태와 화면이 어긋난다.
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
