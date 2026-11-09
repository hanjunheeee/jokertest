// 신고 화면 파일, 상태별 신고 목록(처리 전 먼저·더 보기) + /reports/:id 상세로 나눔
// 메뉴 표(adminRoutes)가 /reports/*에 붙임, 상세는 ReportDetailPage
import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import DataList from '@/admin/shared/ui/DataList'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { fetchReports, reasonLabel, statusLabel } from '@/admin/domains/reports/api/reports.api'
import ReportDetailPage from '@/admin/domains/reports/pages/ReportDetailPage'

const TABS = Object.freeze([
  { status: 'OPEN', label: '처리 전' },
  { status: 'RESOLVED', label: '처리됨' },
  { status: 'DISMISSED', label: '기각' },
  { status: '', label: '전부' },
])
const TAB = 'min-h-11 rounded border border-line px-4 text-sm aria-pressed:border-accent aria-pressed:font-semibold'

const nameOf = (person) => person?.nickname ?? '(이름 없음)'

const columns = [
  { key: 'createdAt', label: '신고 시각', render: (row) => formatKst(row.createdAt) },
  { key: 'target', label: '대상', render: (row) => nameOf(row.target) },
  { key: 'reporter', label: '신고자', render: (row) => nameOf(row.reporter) },
  { key: 'reasonCode', label: '사유', render: (row) => reasonLabel(row.reasonCode) },
  { key: 'status', label: '상태', render: (row) => statusLabel(row.status) },
  { key: 'open', label: '보기', render: (row) => <Link to={`/reports/${row.id}`} className="inline-flex min-h-11 items-center text-accent underline">열기</Link> },
]

// 휴대폰 카드: 대상·사유 크게, 누르면 상세
const renderCard = (row) => (
  <Link to={`/reports/${row.id}`} className="block min-h-11">
    <p className="font-semibold">{nameOf(row.target)} · {reasonLabel(row.reasonCode)}</p>
    <p className="text-sm text-muted">{formatKst(row.createdAt)} · 신고자 {nameOf(row.reporter)} · {statusLabel(row.status)}</p>
  </Link>
)

function ReportList() {
  const [status, setStatus] = useState('OPEN')
  const [list, setList] = useState({ state: 'loading', items: [], nextBefore: null, error: null })

  const load = useCallback(async (before) => {
    if (!before) setList((old) => ({ ...old, state: 'loading' }))
    try {
      const page = await fetchReports({ status, before })
      setList((old) => ({ state: 'ready', items: before ? [...old.items, ...page.items] : page.items, nextBefore: page.nextBefore, error: null }))
    } catch (error) {
      setList((old) => ({ ...old, state: 'error', error }))
    }
  }, [status])

  useEffect(() => { void load() }, [load])

  return (
    <section>
      <PageHeader title="신고" description="게임에서 들어온 신고예요. 열어서 채팅 증거를 보고 정지하거나 기각해 주세요." />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="상태 고르기">
        {TABS.map((tab) => (
          <button key={tab.label} type="button" className={TAB} aria-pressed={status === tab.status} onClick={() => setStatus(tab.status)}>
            {tab.label}
          </button>
        ))}
      </div>
      {list.state === 'loading' ? <StatusNote state="loading" /> : null}
      {list.state === 'error' ? <StatusNote state="error" error={list.error} onRetry={() => load()} /> : null}
      {list.state === 'ready' ? (
        <DataList columns={columns} rows={list.items} renderCard={renderCard} caption="신고 목록"
          empty={status === 'OPEN' ? '처리할 신고가 없어요.' : '이 상태의 신고가 없어요.'} />
      ) : null}
      {list.state === 'ready' && list.nextBefore ? (
        <button type="button" onClick={() => load(list.nextBefore)} className="mt-3 min-h-11 rounded border border-line px-4">더 보기</button>
      ) : null}
    </section>
  )
}

export default function ReportsPage() {
  return (
    <Routes>
      <Route index element={<ReportList />} />
      <Route path=":id" element={<ReportDetailPage />} />
    </Routes>
  )
}
