// 결제 화면 파일, 충전 주문 찾기(회원 UUID·상태·기간) + 더 보기, 주문 누르면 상세(/payments/orders/:orderId)
// 메뉴 표(adminRoutes)가 /payments/*에 붙임
import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import DataList from '@/admin/shared/ui/DataList'
import Field from '@/admin/shared/ui/Field'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { fetchOrders, ORDER_STATUS_LABELS, orderStatusLabel } from '@/admin/domains/payments/api/payments.api'
import OrderDetailPage from '@/admin/domains/payments/pages/OrderDetailPage'

// 한국 날짜(YYYY-MM-DD) → 그날 0시(한국)의 UTC ISO, plusDays로 다음 날 (예: '2026-11-10' → '2026-11-09T15:00:00.000Z')
const kstDayStart = (day, plusDays = 0) => {
  if (!day) return undefined
  const start = new Date(`${day}T00:00:00+09:00`)
  if (Number.isNaN(start.getTime())) return undefined
  return new Date(start.getTime() + plusDays * 86_400_000).toISOString()
}

const EMPTY_FILTER = Object.freeze({ userUuid: '', status: '', from: '', to: '' })

const columns = [
  { key: 'createdAt', label: '주문 시각', render: (row) => formatKst(row.createdAt) },
  { key: 'user', label: '회원', render: (row) => row.user.nickname ?? row.user.uuid },
  { key: 'productId', label: '상품', render: (row) => row.orderName ?? row.productId },
  { key: 'payAmount', label: '금액', render: (row) => `${row.payAmount.toLocaleString('ko-KR')}원` },
  { key: 'status', label: '상태', render: (row) => orderStatusLabel(row.status) },
  { key: 'open', label: '보기', render: (row) => <Link to={`orders/${row.orderId}`} className="text-accent underline">열기</Link> },
]

// 주문 찾기 칸 (회원 UUID·상태·기간)
function OrderSearchForm({ draft, change, search }) {
  return (
    <form onSubmit={search} role="search" aria-label="주문 찾기" className="mb-3 flex flex-wrap items-end gap-2">
      <Field label="회원 UUID" name="userUuid" className="min-w-0 flex-1 basis-64" value={draft.userUuid} onChange={change('userUuid')}
        placeholder="비우면 전체" />
      <Field label="상태" name="status" as="select" value={draft.status} onChange={change('status')}>
        <option value="">전부</option>
        {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Field>
      <Field label="시작 날짜" name="from" type="date" value={draft.from} onChange={change('from')} />
      <Field label="끝 날짜" name="to" type="date" value={draft.to} onChange={change('to')} />
      <button type="submit" className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink">찾기</button>
    </form>
  )
}

function OrderList() {
  // 칸에 적는 값(draft)과 찾기 누른 값(filter)을 따로 → 글자 칠 때마다 서버를 안 부름
  const [draft, setDraft] = useState(EMPTY_FILTER)
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [list, setList] = useState({ state: 'loading', items: [], nextBefore: null, error: null })

  const load = useCallback(async (before) => {
    if (!before) setList((old) => ({ ...old, state: 'loading' }))
    try {
      const page = await fetchOrders({
        userUuid: filter.userUuid.trim(), status: filter.status, from: kstDayStart(filter.from), to: kstDayStart(filter.to, 1), before,
      })
      setList((old) => ({ state: 'ready', items: before ? [...old.items, ...page.items] : page.items, nextBefore: page.nextBefore, error: null }))
    } catch (error) {
      setList((old) => ({ ...old, state: 'error', error }))
    }
  }, [filter])

  useEffect(() => { void load() }, [load])

  const change = (key) => (event) => {
    const { value } = event.target
    setDraft((old) => ({ ...old, [key]: value }))
  }

  const search = (event) => {
    event.preventDefault()
    setFilter({ ...draft })
  }

  return (
    <section>
      <PageHeader title="결제" description="다이아 충전 주문을 찾아 보고, 지급된 주문은 환불할 수 있어요." />
      <OrderSearchForm draft={draft} change={change} search={search} />
      {list.state === 'loading' ? <StatusNote state="loading" /> : null}
      {list.state === 'error' ? <StatusNote state="error" error={list.error} onRetry={() => load()} /> : null}
      {list.state === 'ready' ? (
        <DataList columns={columns} rows={list.items} rowKey="orderId" caption="충전 주문 목록" empty="맞는 주문이 없어요. 찾는 조건을 바꿔 보세요." />
      ) : null}
      {list.state === 'ready' && list.nextBefore ? (
        <button type="button" onClick={() => load(list.nextBefore)} className="mt-3 min-h-11 rounded border border-line px-4">더 보기</button>
      ) : null}
    </section>
  )
}

export default function PaymentsPage() {
  return (
    <Routes>
      <Route index element={<OrderList />} />
      <Route path="orders/:orderId" element={<OrderDetailPage />} />
    </Routes>
  )
}
