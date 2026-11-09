// 통계 화면 파일, 기간(한국 날짜, 최대 92일) 고르기 → 가입·최고 접속·판·매출 막대 + 날짜별 숫자 표
// 메뉴 표(adminRoutes) '/stats'가 붙임, 처음엔 오늘까지 14일
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import Field from '@/admin/shared/ui/Field'
import DataList from '@/admin/shared/ui/DataList'
import { fetchStats } from '@/admin/domains/stats/api/stats.api'
import BarChart from '@/admin/domains/stats/components/BarChart'
import { defaultRange } from '@/admin/domains/stats/utils/kstDate'

const won = (value) => `${value.toLocaleString('ko-KR')}원`

const COLUMNS = [
  { key: 'date', label: '날짜' },
  { key: 'signups', label: '가입' },
  { key: 'peakOnline', label: '최고 접속' },
  { key: 'games', label: '판' },
  { key: 'revenueKrw', label: '매출', render: (row) => won(row.revenueKrw) },
  { key: 'refundsKrw', label: '환불', render: (row) => won(row.refundsKrw) },
]

function RangeForm({ range, onChange, onSubmit, busy }) {
  const submit = (event) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form onSubmit={submit} className="mb-4 flex flex-wrap items-end gap-3">
      <Field label="시작 날짜" type="date" value={range.from} onChange={(event) => onChange({ ...range, from: event.target.value })} required />
      <Field label="끝 날짜" type="date" value={range.to} onChange={(event) => onChange({ ...range, to: event.target.value })} required />
      <button type="submit" disabled={busy} className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
        {busy ? '불러오는 중…' : '보기'}
      </button>
    </form>
  )
}

function Charts({ days }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <BarChart title="가입 수" days={days} valueKey="signups" unit="명" />
      <BarChart title="최고 동시 접속 (서버 합)" days={days} valueKey="peakOnline" unit="명" />
      <BarChart title="끝난 판 수" days={days} valueKey="games" unit="판" />
      <BarChart title="매출 (환불한 주문 뺌)" days={days} valueKey="revenueKrw" unit="원" />
    </div>
  )
}

export default function StatsPage() {
  const [range, setRange] = useState(() => defaultRange())
  const [days, setDays] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (picked) => {
    setBusy(true)
    setError(null)
    try {
      const result = await fetchStats(picked)
      setDays(result.days)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }, [])

  // 처음 한 번 기본 기간으로 (상태는 답 온 뒤에만 바꿈)
  useEffect(() => {
    fetchStats(defaultRange()).then((result) => setDays(result.days), setError)
  }, [])

  return (
    <section className="min-w-0">
      <PageHeader title="통계" description="한국 날짜 기준, 한 번에 92일까지 볼 수 있어요. 매출은 지급된 주문만 셈" />
      <RangeForm range={range} onChange={setRange} onSubmit={() => load(range)} busy={busy} />
      {error ? <StatusNote state="error" error={error} onRetry={() => load(range)} /> : null}
      {!days && !error ? <StatusNote state="loading" /> : null}
      {days ? (
        <div className="flex flex-col gap-4">
          <Charts days={days} />
          <h2 className="text-base font-semibold">날짜별 숫자</h2>
          <DataList columns={COLUMNS} rows={days} rowKey="date" caption="날짜별 통계" empty="고른 기간에 날짜가 없어요." />
        </div>
      ) : null}
    </section>
  )
}
