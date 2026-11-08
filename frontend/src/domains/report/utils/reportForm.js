// 신고 창 판단 (누구를 신고할 수 있나·보낼 본문·입력 검사·오류 안내), 화면 없이 값만 계산
// hooks/useReportDialog.js와 데스크톱·모바일 신고 버튼이 씀
import {
  REPORT_COPY, REPORT_ERROR_FALLBACK, REPORT_ERROR_MESSAGES, REPORT_MEMO_MAX, REPORT_REASONS,
} from "../constants/reportCopy.js"

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const isUuid = (value) => typeof value === "string" && UUID.test(value)

// 신고 버튼을 보일지: 판 id·대상이 uuid고 자기 자신이 아님
// 예) ({ targetUuid: "b…", selfUuid: "a…", gameId: "g…" }) → true / 대상 = 나 → false / 미리보기(판 id 없음) → false
export const canReportPlayer = ({ targetUuid, selfUuid, gameId }) => isUuid(targetUuid) && isUuid(gameId)
  && (typeof selfUuid !== "string" || targetUuid.toLowerCase() !== selfUuid.toLowerCase())

// 같은 판 같은 대상 표시 열쇠 (신고됨 표시용)
export const reportKeyOf = (gameId, targetUuid) => `${gameId}:${String(targetUuid).toLowerCase()}`

// 입력 검사, 통과면 null 아니면 안내 글
// 예) ({ reasonCode: "ETC", memo: " " }) → "기타 사유는 메모를 적어 주세요."
export const validateReportForm = ({ reasonCode, memo }) => {
  if (!REPORT_REASONS.some((reason) => reason.code === reasonCode)) return REPORT_COPY.needReason
  const trimmed = typeof memo === "string" ? memo.trim() : ""
  if (reasonCode === "ETC" && trimmed.length === 0) return REPORT_COPY.needMemo
  if (trimmed.length > REPORT_MEMO_MAX) return REPORT_COPY.memoTooLong
  return null
}

// 서버에 보낼 본문 (빈 메모는 안 넣음, 서버가 모르는 칸은 거절하니 네 칸만)
export const buildReportBody = ({ targetUuid, gameId, reasonCode, memo }) => {
  const trimmed = typeof memo === "string" ? memo.trim() : ""
  return trimmed ? { targetUuid, gameId, reasonCode, memo: trimmed } : { targetUuid, gameId, reasonCode }
}

// 오류 → 안내 글, 중복이면 신고됨으로 볼지도 같이
// 예) { code: "DUPLICATE_REPORT", status: 409 } → { message: "이미 이 판에서…", alreadyReported: true }
export const resolveReportError = (error) => {
  const code = typeof error?.code === "string" ? error.code : null
  const byStatus = error?.status === 429 ? "RATE_LIMITED" : null
  const key = code && Object.hasOwn(REPORT_ERROR_MESSAGES, code) ? code : byStatus
  return {
    message: key ? REPORT_ERROR_MESSAGES[key] : REPORT_ERROR_FALLBACK,
    alreadyReported: key === "DUPLICATE_REPORT",
  }
}
