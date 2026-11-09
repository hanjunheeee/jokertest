// 충전 주문 하나 화면 파일, 주문 값 · 이 주문 장부 줄(지급·환불) · 환불 버튼(지급됨일 때만)
// 결제 화면(PaymentsPage)이 /payments/orders/:orderId 로 붙임
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import DataList from '@/admin/shared/ui/DataList'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { currencyLabel, ledgerReasonLabel, signedAmount } from '@/admin/domains/wallet/api/wallet.api'
import { fetchOrder, orderStatusLabel } from '@/admin/domains/payments/api/payments.api'
import RefundDialog from '@/admin/domains/payments/components/RefundDialog'

const ledgerColumns = [
  { key: 'createdAt', label: '시각', render: (row) => formatKst(row.createdAt) },
  { key: 'reason', label: '사유', render: (row) => ledgerReasonLabel(row.reason) },
  { key: 'amount', label: '양', render: (row) => `${currencyLabel(row.currency)} ${signedAmount(row.amount)}` },
  { key: 'balanceAfter', label: '남은 양', render: (row) => row.balanceAfter.toLocaleString('ko-KR') },
]

// 주문 값 줄 (예: ['결제 금액', '1,100원'])
const orderLines = (order) => [
  ['주문 번호', order.orderId],
  ['상태', orderStatusLabel(order.status)],
  ['회원', <Link key="member" to={`/members/${order.user.uuid}`} className="text-accent underline">{order.user.nickname ?? order.user.uuid}</Link>],
  ['상품', `${order.orderName} (${order.productId} · ${order.version}판)`],
  ['결제 금액', `${order.payAmount.toLocaleString('ko-KR')}원`],
  ['다이아', `${order.grantAmount.toLocaleString('ko-KR')} + 덤 ${order.bonusAmount.toLocaleString('ko-KR')}`],
  ['주문 시각', formatKst(order.createdAt)],
  ['지급 시각', formatKst(order.grantedAt)],
]

// 주문 하나 불러오기 (주문·장부)
function useOrder(orderId) {
  const [detail, setDetail] = useState({ state: 'loading', value: null, error: null })

  const load = useCallback(async () => {
    try {
      const value = await fetchOrder(orderId)
      setDetail({ state: 'ready', value, error: null })
    } catch (error) {
      setDetail((old) => ({ ...old, state: 'error', error }))
    }
  }, [orderId])

  useEffect(() => { void load() }, [load])
  return { detail, load }
}

// 주문 값 표 (상태 칸은 시험이 찾는 표시 붙음)
function OrderFacts({ order }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 rounded border border-line bg-panel p-4 text-sm">
      {orderLines(order).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words" data-testid={label === '상태' ? 'order-status' : undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function OrderDetailPage() {
  const { orderId } = useParams()
  const { detail, load } = useOrder(orderId)
  const [refunding, setRefunding] = useState(false)
  const [done, setDone] = useState(null)

  const afterRefund = (result) => {
    setRefunding(false)
    setDone(result.ledgerEntry)
    void load()
  }

  const order = detail.value?.order
  return (
    <section>
      <PageHeader title="충전 주문" description="환불하면 준 다이아를 장부로 되돌려요. 다이아가 모자라면 멈춰요."
        actions={<Link to="/payments" className="inline-flex min-h-11 items-center rounded border border-line px-4">목록으로</Link>} />
      {detail.state === 'loading' ? <StatusNote state="loading" /> : null}
      {detail.state === 'error' ? <StatusNote state="error" error={detail.error} onRetry={load} /> : null}
      {order ? (
        <>
          {done ? (
            <p role="status" className="mb-4 rounded border border-line bg-panel px-3 py-2 text-sm">
              환불했어요. 다이아 {signedAmount(done.amount)}, 남은 다이아 {done.balanceAfter.toLocaleString('ko-KR')}
            </p>
          ) : null}
          <OrderFacts order={order} />
          {order.status === 'GRANTED' ? (
            <button type="button" onClick={() => setRefunding(true)} className="mt-4 min-h-11 rounded bg-danger px-4 font-semibold text-danger-ink">
              환불
            </button>
          ) : null}
          <h2 className="mb-2 mt-6 font-semibold">이 주문 장부</h2>
          <DataList columns={ledgerColumns} rows={detail.value.ledger} caption="이 주문 장부" empty="장부 줄이 없어요(아직 지급 전)." />
          {refunding ? <RefundDialog order={order} onDone={afterRefund} onCancel={() => setRefunding(false)} /> : null}
        </>
      ) : null}
    </section>
  )
}
