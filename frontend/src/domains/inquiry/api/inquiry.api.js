// 문의 서버 요청(쓰기·내 목록·하나 보기)과 보낼 값 검사·오류 안내 글
// useInquiries 훅·데스크톱 문의 창·모바일 문의 창이 씀
import { api } from "@/shared/api/client.js"

// 서버 경로 (플레이어 로그인 그대로)
export const inquiryApi = {
  // 본문 { category, title, body } → { ok, inquiry }
  create: (body) => api.post("/inquiries", body),
  // → { ok, inquiries: [{ id, category, title, status, createdAt, answeredAt }] }
  list: () => api.get("/inquiries"),
  // → { ok, inquiry: { …, body, replies: [{ id, body, createdAt, from }] } }
  get: (id) => api.get(`/inquiries/${encodeURIComponent(String(id))}`),
}

// 종류 셋 (서버 BUG·ACCOUNT·ETC와 짝)
export const INQUIRY_CATEGORIES = Object.freeze([
  { code: "BUG", label: "버그" },
  { code: "ACCOUNT", label: "계정" },
  { code: "ETC", label: "기타" },
])

// 글자 수 끝 (서버 검사와 같음)
export const INQUIRY_TITLE_MAX = 100
export const INQUIRY_BODY_MAX = 2000

// 상태 글자, 모르는 상태는 답 기다림으로 보임
export const inquiryStatusLabel = (status) => (status === "ANSWERED" ? "답함" : "답 기다림")
export const inquiryCategoryLabel = (code) =>
  INQUIRY_CATEGORIES.find((item) => item.code === code)?.label ?? "기타"

export const INQUIRY_COPY = Object.freeze({
  title: "고객센터 문의",
  closeLabel: "문의 창 닫기",
  listTab: "내 문의",
  formTab: "문의 쓰기",
  categoryLabel: "문의 종류",
  titleLabel: "제목",
  titlePlaceholder: "어떤 일인지 짧게 적어 주세요",
  bodyLabel: "내용",
  bodyPlaceholder: "언제·어디서·무슨 일이 있었는지 적어 주세요",
  submitLabel: "문의 보내기",
  sendingLabel: "보내는 중",
  sent: "문의를 보냈어요. 답이 오면 알림으로 알려 드려요.",
  loading: "불러오는 중이에요.",
  empty: "아직 보낸 문의가 없어요. 문의 쓰기에서 궁금한 것을 보내 주세요.",
  listError: "내 문의를 불러오지 못했어요. 다시 불러와 주세요.",
  retry: "다시 불러오기",
  back: "목록으로",
  noReply: "아직 답이 없어요. 운영팀이 확인하면 여기에 답이 보여요.",
  replyFrom: "운영팀",
  needCategory: "문의 종류를 골라 주세요.",
  needTitle: "제목을 적어 주세요.",
  needBody: "내용을 적어 주세요.",
  titleTooLong: `제목은 ${INQUIRY_TITLE_MAX}자까지 적을 수 있어요.`,
  bodyTooLong: `내용은 ${INQUIRY_BODY_MAX}자까지 적을 수 있어요.`,
})

// 서버 오류 코드별 안내 (모르는 코드는 INQUIRY_ERROR_FALLBACK)
export const INQUIRY_ERROR_MESSAGES = Object.freeze({
  INQUIRY_RATE_LIMITED: "문의를 너무 자주 보냈어요. 잠시 뒤 다시 보내 주세요.",
  INQUIRY_OPEN_LIMIT: "답을 기다리는 문의가 5개 있어요. 답이 온 뒤에 새로 보내 주세요.",
  INQUIRY_NOT_FOUND: "그 문의를 찾을 수 없어요. 내 문의 목록에서 다시 골라 주세요.",
  INVALID_INQUIRY: "문의 내용을 다시 확인해 주세요. 종류·제목·내용을 모두 적어야 해요.",
})
export const INQUIRY_ERROR_FALLBACK = "문의를 보내지 못했어요. 인터넷 연결을 확인하고 다시 보내 주세요."

// 입력 검사, 통과면 null 아니면 안내 글
// 예) ({ category: "BUG", title: " ", body: "x" }) → "제목을 적어 주세요."
export const validateInquiryForm = ({ category, title, body }) => {
  if (!INQUIRY_CATEGORIES.some((item) => item.code === category)) return INQUIRY_COPY.needCategory
  const t = typeof title === "string" ? title.trim() : ""
  const b = typeof body === "string" ? body.trim() : ""
  if (t.length === 0) return INQUIRY_COPY.needTitle
  if (t.length > INQUIRY_TITLE_MAX) return INQUIRY_COPY.titleTooLong
  if (b.length === 0) return INQUIRY_COPY.needBody
  if (b.length > INQUIRY_BODY_MAX) return INQUIRY_COPY.bodyTooLong
  return null
}

// 보낼 본문 (앞뒤 빈칸 뺌, 서버가 모르는 칸은 거절하니 셋만)
export const buildInquiryBody = ({ category, title, body }) => ({
  category,
  title: title.trim(),
  body: body.trim(),
})

// 오류 → 안내 글, 코드 없이 429면 너무 자주로 봄
// 예) { status: 409, code: "INQUIRY_OPEN_LIMIT" } → "답을 기다리는 문의가 5개 있어요. …"
export const resolveInquiryError = (error) => {
  const code = typeof error?.code === "string" ? error.code : null
  if (code && Object.hasOwn(INQUIRY_ERROR_MESSAGES, code)) return INQUIRY_ERROR_MESSAGES[code]
  if (error?.status === 429) return INQUIRY_ERROR_MESSAGES.INQUIRY_RATE_LIMITED
  if (error?.status === 404) return INQUIRY_ERROR_MESSAGES.INQUIRY_NOT_FOUND
  return INQUIRY_ERROR_FALLBACK
}

// 날짜 글자 (한국 시각 "11월 10일 14:05"), 이상한 값이면 빈 글자
export const formatInquiryDate = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date)
}
