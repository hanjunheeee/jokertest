/**
 * 확대 시간흐름바 탑레벨 프레임 상태 문구 — `[낮-토론과 투표]` 형태로 통일한다.
 * @param {string} head 구분(낮·밤·재판 등)
 * @param {string} detail 세부 상태
 */
export function formatInGameTimebarPhaseTag(head, detail) {
  if (typeof head !== "string" || head.length === 0) return ""
  if (typeof detail !== "string" || detail.length === 0) return ""
  return `[${head}-${detail}]`
}
