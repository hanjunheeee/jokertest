// 처리 이력 화면 파일, 칸(전체·공지 발송 이력·제재·해제 이력) + 누가·기간·회원으로 거르기 + 50줄씩 더 보기
// 메뉴 "처리 이력"(/audit-logs), 기록 고치기·지우기 버튼은 없음 (보기만)
import { useEffect, useRef, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import DataList from '@/admin/shared/ui/DataList'
import Field from '@/admin/shared/ui/Field'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { fetchAdmins, fetchAuditLogs, searchMembers } from '@/admin/domains/auditLogs/api/auditLogs.api'
import AuditRow, { AuditDetails, KindCell, SummaryCell, TargetCell } from '@/admin/domains/auditLogs/components/AuditRow'

const KINDS = Object.freeze([
  { value: 'all', label: '전체' },
  { value: 'announce', label: '공지 발송 이력' },
  { value: 'sanction', label: '제재·해제 이력' },
])
const DAY_MS = 24 * 60 * 60 * 1000
const BUTTON = 'min-h-11 rounded border border-line px-3 text-sm hover:bg-page disabled:opacity-50'

// 한국 날짜 '2026-11-10' → 그날 0시(한국) UTC 글자, plusDay면 다음 날 0시
// 예) '2026-11-10' → '2026-11-09T15:00:00.000Z'
const kstDayStart = (day, plusDay = false) => {
  if (!day) return ''
  const start = Date.parse(`${day}T00:00:00+09:00`)
  return Number.isNaN(start) ? '' : new Date(start + (plusDay ? DAY_MS : 0)).toISOString()
}

const COLUMNS = Object.freeze([
  { key: 'createdAt', label: '시각', render: (row) => formatKst(row.createdAt) },
  { key: 'admin', label: '처리', render: (row) => row.admin?.loginId ?? '—' },
  { key: 'action', label: '무엇을', render: (row) => <KindCell row={row} /> },
  { key: 'target', label: '대상', render: (row) => <TargetCell row={row} /> },
  { key: 'summary', label: '내용·사유', render: (row) => <SummaryCell row={row} /> },
  { key: 'details', label: '자세히', render: (row) => <AuditDetails row={row} /> },
])

// 회원으로 거르기: 닉네임·UUID로 찾아 한 명 고름
function MemberFilter({ member, onPick }) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [error, setError] = useState(null)
  const text = query.trim()

  if (member) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        회원: <strong>{member.nickname}</strong>
        <button type="button" className={BUTTON} onClick={() => onPick(null)}>회원 거르기 풀기</button>
      </p>
    )
  }
  const search = async (event) => {
    event.preventDefault()
    if (text.length < 2) return
    setError(null)
    try {
      setFound((await searchMembers(text)).items ?? [])
    } catch (caught) {
      setError(caught)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <Field label="회원으로 찾기" hint="닉네임 앞부분(2자 이상) 또는 UUID" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1" />
        <button type="submit" className={BUTTON} disabled={text.length < 2}>회원 찾기</button>
      </form>
      {error ? <StatusNote state="error" error={error} /> : null}
      {found && found.length === 0 ? <StatusNote state="empty">찾은 회원이 없어요.</StatusNote> : null}
      {found && found.length > 0 ? (
        <ul aria-label="찾은 회원" className="flex flex-col gap-1">
          {found.map((item) => (
            <li key={item.uuid} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-all">{item.nickname} <span className="text-muted">{item.uuid}</span></span>
              <button type="button" className={BUTTON} onClick={() => onPick({ uuid: item.uuid, nickname: item.nickname })}>이 회원 이력</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// 이력 칸 단추 셋 (전체 · 공지 발송 이력 · 제재·해제 이력)
function KindTabs({ kind, onChange }) {
  return (
    <div role="group" aria-label="이력 칸" className="flex flex-wrap gap-2">
      {KINDS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={kind === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-11 rounded border px-4 text-sm ${kind === option.value ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:bg-page'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// 목록 불러오기 손잡이: 거르기 글자(filterKey)가 바뀌면 처음부터, 더 보기는 이어 붙임
// → { view:{ items, nextBefore, error }, loading, more:{ busy, error }, reload, loadMore }
function useAuditLogList(filterKey) {
  // view.key = 지금 보이는 목록의 거르기 (거르기와 다르면 불러오는 중)
  const [view, setView] = useState({ key: null, items: [], nextBefore: null, error: null })
  const [more, setMore] = useState({ busy: false, error: null })
  const [retry, setRetry] = useState(0)
  // 거르기를 빨리 바꿔도 마지막 요청 응답만 씀
  const latest = useRef(0)

  const loading = view.key !== filterKey

  useEffect(() => {
    latest.current += 1
    const ticket = latest.current
    const show = (next) => {
      if (latest.current !== ticket) return
      setView(next)
      setMore({ busy: false, error: null })
    }
    fetchAuditLogs(JSON.parse(filterKey)).then(
      (answer) => show({ key: filterKey, items: answer.items ?? [], nextBefore: answer.nextBefore ?? null, error: null }),
      (error) => show({ key: filterKey, items: [], nextBefore: null, error }),
    )
  }, [filterKey, retry])

  const reload = () => {
    setView((prev) => ({ ...prev, key: null }))
    setRetry((count) => count + 1)
  }

  // 더 보기: 지금 마지막 id 앞 50줄을 뒤에 이어 붙임
  const loadMore = async () => {
    const ticket = latest.current
    setMore({ busy: true, error: null })
    try {
      const answer = await fetchAuditLogs({ ...JSON.parse(filterKey), before: view.nextBefore })
      if (latest.current !== ticket) return
      setView((prev) => ({ ...prev, items: [...prev.items, ...(answer.items ?? [])], nextBefore: answer.nextBefore ?? null }))
      setMore({ busy: false, error: null })
    } catch (error) {
      if (latest.current === ticket) setMore({ busy: false, error })
    }
  }

  return { view, loading, more, reload, loadMore }
}

// 결과 칸: 불러오는 중·오류·목록·더 보기
function AuditResults({ loading, view, more, reload, loadMore }) {
  return (
    <>
      {loading ? <StatusNote state="loading" /> : null}
      {!loading && view.error ? <StatusNote state="error" error={view.error} onRetry={reload} /> : null}
      {!loading && !view.error ? (
        <DataList
          caption="처리 이력"
          columns={COLUMNS}
          rows={view.items}
          renderCard={(row) => <AuditRow row={row} />}
          empty="이 거르기에 맞는 기록이 없어요. 칸이나 기간을 바꿔 보세요."
        />
      ) : null}
      {!loading && more.error ? <StatusNote state="error" error={more.error} onRetry={loadMore} /> : null}
      {!loading && view.nextBefore ? (
        <div>
          <button type="button" className={BUTTON} disabled={more.busy} onClick={loadMore}>
            {more.busy ? '불러오는 중…' : '더 보기'}
          </button>
        </div>
      ) : null}
    </>
  )
}

export default function AuditLogsPage() {
  const [kind, setKind] = useState('all')
  const [adminId, setAdminId] = useState('')
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  const [member, setMember] = useState(null)
  const [admins, setAdmins] = useState([])
  const filters = { kind, adminId, memberUuid: member?.uuid ?? '', from: kstDayStart(fromDay), to: kstDayStart(toDay, true) }
  const filterKey = JSON.stringify(filters)
  const { view, loading, more, reload, loadMore } = useAuditLogList(filterKey)

  useEffect(() => {
    fetchAdmins().then((answer) => setAdmins(answer.items ?? []), () => setAdmins([]))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="처리 이력" description="관리자가 한 일을 모두 보여 줘요. 기록은 고치거나 지울 수 없어요." />

      <KindTabs kind={kind} onChange={setKind} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field as="select" label="누가" value={adminId} onChange={(event) => setAdminId(event.target.value)}>
          <option value="">모든 관리자</option>
          {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.loginId}</option>)}
        </Field>
        <Field type="date" label="시작 날짜" value={fromDay} onChange={(event) => setFromDay(event.target.value)} />
        <Field type="date" label="끝 날짜" value={toDay} onChange={(event) => setToDay(event.target.value)} />
      </div>
      <MemberFilter member={member} onPick={setMember} />

      <AuditResults loading={loading} view={view} more={more} reload={reload} loadMore={loadMore} />
    </div>
  )
}
