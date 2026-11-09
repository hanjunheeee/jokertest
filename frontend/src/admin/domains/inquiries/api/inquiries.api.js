// 문의 서버 부르기 파일, 목록 · 문의 하나 · 답 달기 (/admin-api/inquiries) + 서버 값 → 화면 글
// 문의 화면(InquiriesPage·InquiryDetailPage)이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

// 서버 값 → 화면 글 (종류·상태)
export const CATEGORY_TEXT = Object.freeze({ BUG: '버그', ACCOUNT: '계정', ETC: '기타' })
export const STATUS_TEXT = Object.freeze({ OPEN: '답 기다림', ANSWERED: '답함' })

// 비지 않은 값만 주소 뒤에 (예: { status:'OPEN', before:'' } → '?status=OPEN')
const queryOf = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

// → { items:[{ id, user:{ uuid, nickname }, category, title, status, createdAt, answeredAt, replyCount }], nextBefore }
export const fetchInquiries = ({ status, before } = {}) => adminApi.get(`/inquiries${queryOf({ status, before })}`)

// → { inquiry:{ id, category, title, body, status, createdAt, answeredAt }, user, replies:[{ id, admin:{ loginId }, body, createdAt }] }
export const fetchInquiry = (id) => adminApi.get(`/inquiries/${encodeURIComponent(id)}`)

// → { reply, inquiry:{ id, status, answeredAt }, notified }
export const sendInquiryReply = (id, { requestId, body }) => adminApi.send('POST', `/inquiries/${encodeURIComponent(id)}/replies`, { requestId, body })
