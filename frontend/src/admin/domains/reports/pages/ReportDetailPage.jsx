// 신고 상세 화면 파일, 사유·메모·채팅 증거·대상 지난 정지를 보고 "정지"(기간·사유) 또는 "기각"
// ReportsPage가 /reports/:id에 붙임, 다른 관리자가 먼저 처리했으면 "이미 처리됨(누가·언제)"
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import Field from '@/admin/shared/ui/Field'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import { formatKst } from '@/admin/shared/utils/time'
import EvidenceView from '@/admin/domains/reports/components/EvidenceView'
import { dismissReport, fetchReport, reasonLabel, resolveReport, statusLabel } from '@/admin/domains/reports/api/reports.api'

const BUTTON = 'min-h-11 rounded px-4 font-semibold'
const EMPTY_BAN = { kind: 'PERIOD', days: '7', reason: '', memo: '' }

// 이미 처리됨 안내 (예: { handledBy:'ceo', handledAt:'…' } → 'ceo가 2026-11-10 12:00에 이미 처리했어요.')
const handledText = ({ handledBy, handledAt }) => `${handledBy ?? '다른 관리자'}가 ${formatKst(handledAt)}에 이미 처리했어요.`

const banLine = (form) => (form.kind === 'PERMANENT' ? '기간: 영구 정지' : `기간: ${form.days}일`)

function BanFields({ form, setForm }) {
  const set = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }))
  return (
    <div className="flex flex-col gap-3">
      <Field label="정지 종류" as="select" value={form.kind} onChange={set('kind')}>
        <option value="PERIOD">기간 정지</option>
        <option value="PERMANENT">영구 정지</option>
      </Field>
      {form.kind === 'PERIOD' ? <Field label="정지 일수" type="number" inputMode="numeric" min="1" max="3650" value={form.days} onChange={set('days')} /> : null}
      <Field label="정지 사유" hint="플레이어에게 보이는 사유예요." maxLength={200} value={form.reason} onChange={set('reason')} />
      <Field label="관리자 메모 (안 써도 됨)" as="textarea" maxLength={500} value={form.memo} onChange={set('memo')} />
    </div>
  )
}

const banReady = (form) => form.reason.trim() !== '' && (form.kind === 'PERMANENT' || (Number.isInteger(Number(form.days)) && Number(form.days) >= 1 && Number(form.days) <= 3650))
const banBody = (form) => (form.kind === 'PERMANENT'
  ? { kind: 'PERMANENT', reason: form.reason.trim() }
  : { kind: 'PERIOD', days: Number(form.days), reason: form.reason.trim() })

function ReportFacts({ report, targetHistory }) {
  const activeBan = targetHistory.bans.find((ban) => ban.active)
  return (
    <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded border border-line bg-panel p-3 text-sm">
      <dt className="text-muted">상태</dt><dd>{statusLabel(report.status)}{report.handledAt ? ` · ${report.handledBy ?? '관리자'} ${formatKst(report.handledAt)}` : ''}</dd>
      <dt className="text-muted">대상</dt><dd><Link to={`/members/${report.target.uuid}`} className="text-accent underline">{report.target.nickname ?? report.target.uuid}</Link></dd>
      <dt className="text-muted">신고자</dt><dd>{report.reporter.nickname ?? report.reporter.uuid}</dd>
      <dt className="text-muted">사유</dt><dd>{reasonLabel(report.reasonCode)}</dd>
      <dt className="text-muted">신고 메모</dt><dd className="break-words">{report.memo ?? '—'}</dd>
      <dt className="text-muted">신고 시각</dt><dd>{formatKst(report.createdAt)}</dd>
      <dt className="text-muted">대상 기록</dt>
      <dd>받은 신고 {targetHistory.reportCount}건 · 지난 정지 {targetHistory.bans.length}건{activeBan ? ' · 지금 정지 중' : ''}</dd>
    </dl>
  )
}

// 처리 버튼 + 확인 창 (정지·기각), 끝나면 onDone(안내 글귀)
function ReportActions({ report, onDone }) {
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState(EMPTY_BAN)
  const run = async (action) => {
    try {
      await action()
      setOpen(null)
      onDone(open === 'ban' ? '정지하고 신고를 처리했어요.' : '신고를 기각했어요.')
    } catch (error) {
      if (error.code !== 'REPORT_ALREADY_HANDLED') throw error
      setOpen(null)
      onDone(handledText(error.details ?? {}))
    }
  }
  const name = report.target.nickname ?? report.target.uuid
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className={`${BUTTON} bg-danger text-danger-ink`} onClick={() => { setForm(EMPTY_BAN); setOpen('ban') }}>정지</button>
      <button type="button" className={`${BUTTON} border border-line`} onClick={() => { setForm(EMPTY_BAN); setOpen('dismiss') }}>기각</button>
      {open === 'ban' ? (
        <ConfirmDialog title="정지하고 신고 처리" danger confirmLabel="정지" confirmDisabled={!banReady(form)}
          lines={[`대상: ${name}`, banLine(form), `사유: ${form.reason.trim() || '(비어 있음)'}`]}
          onCancel={() => setOpen(null)} onConfirm={() => run(() => resolveReport(report.id, { ban: banBody(form), memo: form.memo.trim() }))}>
          <BanFields form={form} setForm={setForm} />
        </ConfirmDialog>
      ) : null}
      {open === 'dismiss' ? (
        <ConfirmDialog title="신고 기각" confirmLabel="기각" lines={[`대상: ${name}`, '정지 없이 신고만 닫아요.']}
          onCancel={() => setOpen(null)} onConfirm={() => run(() => dismissReport(report.id, { memo: form.memo.trim() }))}>
          <Field label="관리자 메모 (안 써도 됨)" as="textarea" maxLength={500} value={form.memo}
            onChange={(event) => setForm((old) => ({ ...old, memo: event.target.value }))} />
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

export default function ReportDetailPage() {
  const { id } = useParams()
  const [view, setView] = useState({ state: 'loading', detail: null, error: null })
  const [notice, setNotice] = useState(null)

  const load = useCallback(() => fetchReport(id).then(
    (detail) => setView({ state: 'ready', detail, error: null }),
    (error) => setView({ state: 'error', detail: null, error }),
  ), [id])
  useEffect(() => { void load() }, [load])

  const done = (text) => {
    setNotice(text)
    void load()
  }

  const back = <Link to="/reports" className="inline-flex min-h-11 items-center rounded border border-line px-3">목록으로</Link>
  if (view.state === 'loading') return <StatusNote state="loading" />
  if (view.state === 'error') return <section><PageHeader title="신고" actions={back} /><StatusNote state="error" error={view.error} onRetry={load} /></section>
  const { report, evidence, targetHistory } = view.detail
  return (
    <section>
      <PageHeader title={`신고 #${report.id}`} description={`${report.target.nickname ?? '대상'} · ${reasonLabel(report.reasonCode)}`} actions={back} />
      {notice ? <p role="status" className="mb-4 rounded border border-line bg-panel px-3 py-2 text-sm">{notice}</p> : null}
      <ReportFacts report={report} targetHistory={targetHistory} />
      <h2 className="mb-2 font-bold">그 판 채팅 증거</h2>
      <EvidenceView evidence={evidence} targetUuid={report.target.uuid} />
      {report.status === 'OPEN' ? <ReportActions report={report} onDone={done} /> : null}
    </section>
  )
}
