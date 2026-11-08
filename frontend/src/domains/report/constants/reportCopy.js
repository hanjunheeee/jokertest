// 신고 창 글·사유 목록·오류 안내 (데스크톱·모바일 신고 창이 같은 글을 보이게)
// utils/reportForm.js·데스크톱 ReportDialog·모바일 ReportSheet가 씀

// 사유 (서버 REPORT_REASON_CODES 중 화면에 보이는 넷)
export const REPORT_REASONS = Object.freeze([
  { code: "ABUSE", label: "욕설" },
  { code: "GRIEFING", label: "비매너" },
  { code: "CHEATING", label: "부정행위" },
  { code: "ETC", label: "기타" },
])

// 메모 최대 글자 (서버 MAX_MEMO와 같음)
export const REPORT_MEMO_MAX = 500

export const REPORT_COPY = Object.freeze({
  title: "플레이어 신고",
  closeAriaLabel: "신고 창 닫기",
  subtitle: "신고 사유를 골라 주세요. 같이 한 판의 채팅 기록이 함께 보내집니다.",
  reasonGroupLabel: "신고 사유",
  memoLabel: "메모",
  memoPlaceholder: "있었던 일을 짧게 적어 주세요 (기타는 꼭 적기)",
  submitLabel: "신고하기",
  sendingLabel: "보내는 중",
  cancelLabel: "취소",
  closeLabel: "닫기",
  rowButtonLabel: "신고",
  rowDoneLabel: "신고됨",
  sent: "신고가 접수되었습니다. 운영자가 확인합니다.",
  needReason: "신고 사유를 골라 주세요.",
  needMemo: "기타 사유는 메모를 적어 주세요.",
  memoTooLong: `메모는 ${REPORT_MEMO_MAX}자까지 적을 수 있습니다.`,
})

// 서버 오류 코드별 안내 (모르는 코드는 REPORT_ERROR_FALLBACK)
export const REPORT_ERROR_MESSAGES = Object.freeze({
  DUPLICATE_REPORT: "이미 이 판에서 신고한 플레이어입니다.",
  RATE_LIMITED: "신고가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  SELF_REPORT: "자기 자신은 신고할 수 없습니다.",
  GAME_NOT_FOUND: "같이 한 판을 찾을 수 없어 신고하지 못했습니다.",
  INVALID_REPORT: "신고 내용이 올바르지 않습니다. 다시 확인해주세요.",
})
export const REPORT_ERROR_FALLBACK = "신고를 보내지 못했습니다. 잠시 후 다시 시도해주세요."
