// 처리 이력 한 줄 보여 주기 파일, 동작 이름표 · 대상 · 한 줄 요약(공지 결과 수·제재 종류) · 전후 값 펼쳐 보기
// AuditLogsPage가 표 칸(넓은 화면)과 카드(휴대폰)에 씀
import { formatKst } from '@/admin/shared/utils/time'

const ACTION_LABELS = Object.freeze({
  ADMIN_LOGIN: '로그인',
  ADMIN_LOGOUT: '로그아웃',
  VIEW_PII: '이메일 전체 보기',
  VIEW_EVIDENCE: '채팅 증거 보기',
  FORCE_DISCONNECT: '강제 접속 종료',
  BAN: '정지',
  BAN_UPDATE: '정지 기간 바꿈',
  UNBAN: '정지 해제',
  REPORT_RESOLVE: '신고 처리',
  REPORT_DISMISS: '신고 기각',
  ANNOUNCE: '공지',
  INQUIRY_REPLY: '문의 답',
  MAINTENANCE_UPDATE: '점검 바꿈',
  MAINTENANCE_FORCE_END: '점검 강제 종료',
  BANNED_WORD_ADD: '금지어 넣기',
  BANNED_WORD_TOGGLE: '금지어 켜기·끄기',
  REFUND: '환불',
  WALLET_ADJUST: '골드·다이아 주고 뺏기',
  PRODUCT_CREATE: '상품 만들기',
  PRODUCT_UPDATE: '상품 고치기',
  COUPON_CREATE: '쿠폰 만들기',
  COUPON_TOGGLE: '쿠폰 켜기·끄기',
  TERMS_CREATE: '약관 새 버전',
})

const actionLabel = (action) => ACTION_LABELS[action] ?? action

// 정지 종류 글자 (1-2 정지 기록 after 모양: { ban:{ isPermanent, … }, kind, days })
// 예) { kind:'PERIOD', days:7 } → '기간 정지 7일', { kind:'PERMANENT' } → '영구 정지'
const banKindText = (after) => {
  const value = after ?? {}
  if (value.kind === 'PERMANENT' || value.ban?.isPermanent === true) return '영구 정지'
  if (value.days) return `기간 정지 ${value.days}일`
  return null
}

// 무엇을: 동작 이름 + 제재면 종류
const kindText = (row) => {
  const label = actionLabel(row.action)
  if (row.action === 'BAN' || row.action === 'BAN_UPDATE') {
    const kind = banKindText(row.after)
    return kind ? `${label} (${kind})` : label
  }
  return label
}

// 대상: 회원이면 닉네임(없으면 uuid), 공지면 받는 사람, 그 밖은 종류·id
const targetText = (row) => {
  if (row.action === 'ANNOUNCE') {
    const after = row.after ?? {}
    return after.target === 'users' ? `고른 사람 ${after.selectedCount ?? 0}명` : '접속 중 전체'
  }
  if (row.target?.nickname) return row.target.nickname
  return row.targetId ? `${row.targetType ?? ''} ${row.targetId}`.trim() : '—'
}

// 한 줄 요약: 공지는 제목·결과 수, 나머지는 사유
// 예) 공지 { title:'점검', recipientCount:3, created:2, duplicated:1, failed:0 } → '점검 · 받는 사람 3 · 새로 보냄 2 · 중복 1 · 실패 0'
const summaryText = (row) => {
  if (row.action === 'ANNOUNCE') {
    const after = row.after ?? {}
    return `${after.title ?? ''} · 받는 사람 ${after.recipientCount ?? 0} · 새로 보냄 ${after.created ?? 0} · 중복 ${after.duplicated ?? 0} · 실패 ${after.failed ?? 0}`
  }
  return row.reason || '—'
}

const pretty = (value) => (value === null || value === undefined ? '없음' : JSON.stringify(value, null, 2))

// 전후 값 펼쳐 보기 (접어 둔 채 시작)
export function AuditDetails({ row }) {
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer py-2 text-accent">전후 값 보기</summary>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="font-semibold">전</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-line p-2 text-xs">{pretty(row.before)}</pre>
        </div>
        <div>
          <p className="font-semibold">후</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-line p-2 text-xs">{pretty(row.after)}</pre>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">IP {row.ip ?? '—'} · 메일 확인 {row.accessEmail ?? '—'}</p>
    </details>
  )
}

// 표 칸 (넓은 화면): 무엇을 · 대상 · 내용·사유
export const KindCell = ({ row }) => kindText(row)
export const TargetCell = ({ row }) => targetText(row)
export const SummaryCell = ({ row }) => summaryText(row)

// 휴대폰 카드 한 장
export default function AuditRow({ row }) {
  return (
    <article className="flex flex-col gap-1 text-sm">
      <p className="flex flex-wrap justify-between gap-2">
        <span className="font-semibold">{kindText(row)}</span>
        <span className="text-muted">{formatKst(row.createdAt)}</span>
      </p>
      <p>대상: {targetText(row)}</p>
      <p className="break-words">{summaryText(row)}</p>
      <p className="text-muted">처리: {row.admin?.loginId ?? '—'}</p>
      <AuditDetails row={row} />
    </article>
  )
}
