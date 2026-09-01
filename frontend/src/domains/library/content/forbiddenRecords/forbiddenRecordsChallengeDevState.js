/**
 * [DEV] 도전과제 클리어 상태 테스트용 설정입니다.
 *
 * - `true`: 해당 spread 우측에 핏자국·도전과제 UI 대신 클리어 일러스트 표시
 * - `false`: 핏자국 + 도전과제 UI (기본)
 *
 * API 연동 후에는 서버 응답으로 대체하고, 이 파일의 오버라이드는 제거합니다.
 */
export const FORBIDDEN_RECORDS_CHALLENGE_CLEARED_DEV = {
  "record-1-masquerade": false,
  "record-2-extra-mask": false,
  "record-3-first-morning": false,
  "record-4-testimonies": false,
  "record-5-clown-story": false,
  "record-6-dead-mans-leaving": false,
  "record-7-erased-night": false,
}

/** @param {string} spreadId */
export function isForbiddenRecordChallengeCleared(spreadId) {
  return FORBIDDEN_RECORDS_CHALLENGE_CLEARED_DEV[spreadId] === true
}
