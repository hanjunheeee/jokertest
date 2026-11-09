// 결제 서버 부르기 파일, 충전 주문 찾기 · 주문 하나 · 환불 (/admin-api/payments)
// 결제 화면(PaymentsPage·OrderDetailPage·RefundDialog)이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

// 주문 상태 → 화면 글
export const ORDER_STATUS_LABELS = Object.freeze({
  CREATED: '결제 전', CONFIRMING: '확인 중', PENDING_GRANT: '지급 대기', GRANTED: '지급됨',
  FAILED: '실패', CANCELED: '취소', EXPIRED: '만료', REFUNDED: '환불됨',
})
export const orderStatusLabel = (status) => ORDER_STATUS_LABELS[status] ?? status

// 비지 않은 값만 주소 뒤에 (예: { status:'GRANTED', userUuid:'' } → '?status=GRANTED')
const queryOf = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

// from·to는 ISO 글자 → { items:[{ orderId, user, productId, payAmount, grantAmount, bonusAmount, status, createdAt, grantedAt }], nextBefore }
export const fetchOrders = ({ userUuid, status, from, to, before } = {}) =>
  adminApi.get(`/payments/orders${queryOf({ userUuid, status, from, to, before })}`)

// → { order, ledger }
export const fetchOrder = (orderId) => adminApi.get(`/payments/orders/${encodeURIComponent(orderId)}`)

// → { order:{ orderId, status:'REFUNDED' }, ledgerEntry:{ amount, balanceAfter } }
export const refundOrder = (orderId, reason) => adminApi.send('POST', `/payments/orders/${encodeURIComponent(orderId)}/refund`, { reason })
