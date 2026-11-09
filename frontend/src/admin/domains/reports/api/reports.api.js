// 신고 서버 부르기 파일, 목록 · 상세 · 처리(정지) · 기각 (/admin-api/reports)
// 신고 화면(ReportsPage·ReportDetailPage)이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

// 비지 않은 값만 주소 뒤에 (예: { status:'OPEN', before:null } → '?status=OPEN')
const queryOf = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

// → { items:[{ id, reporter, target, gameId, reasonCode, memo, status, createdAt, handledAt, handledBy }], nextBefore }
export const fetchReports = ({ status, before } = {}) => adminApi.get(`/reports${queryOf({ status, before })}`)

// → { report, evidence:{ savedAt, messages } | null, targetHistory:{ bans, reportCount } }
export const fetchReport = (id) => adminApi.get(`/reports/${id}`)

// ban: { kind:'PERIOD', days, reason } | { kind:'PERMANENT', reason } → { report, ban, disconnect }
export const resolveReport = (id, { ban, memo }) => adminApi.send('POST', `/reports/${id}/resolve`, memo ? { ban, memo } : { ban })

export const dismissReport = (id, { memo }) => adminApi.send('POST', `/reports/${id}/dismiss`, memo ? { memo } : {})

// 신고 사유 코드 → 화면 이름 (목록·상세가 같이 씀)
const REASON_LABELS = Object.freeze({ ABUSE: '욕설', SPAM: '도배', GRIEFING: '고의 방해', CHEATING: '부정행위', NICKNAME: '닉네임', ETC: '기타' })
export const reasonLabel = (code) => REASON_LABELS[code] ?? code

// 신고 상태 → 화면 이름
const STATUS_LABELS = Object.freeze({ OPEN: '처리 전', RESOLVED: '처리됨(정지)', DISMISSED: '기각' })
export const statusLabel = (status) => STATUS_LABELS[status] ?? status
