// 환불 확인 창 파일, 주문·되돌릴 다이아·사유를 다시 보여 주고 누르면 환불 (사유 비면 버튼 꺼짐)
// 주문 상세(OrderDetailPage)가 씀, 결제 회사 쪽 취소는 결제 회사 화면에서 따로 해야 한다고 알려 줌
import { useState } from 'react'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import Field from '@/admin/shared/ui/Field'
import { refundOrder } from '@/admin/domains/payments/api/payments.api'

const REASON_MAX = 200

export default function RefundDialog({ order, onDone, onCancel }) {
  const [reason, setReason] = useState('')
  const text = reason.trim()
  const diamonds = order.grantAmount + order.bonusAmount

  const confirm = async () => {
    onDone(await refundOrder(order.orderId, text))
  }

  return (
    <ConfirmDialog
      title="이 주문을 환불할까요?"
      lines={[
        `주문: ${order.orderName ?? order.productId} (${order.payAmount.toLocaleString('ko-KR')}원)`,
        `회원: ${order.user.nickname ?? order.user.uuid}`,
        `되돌릴 다이아: ${diamonds.toLocaleString('ko-KR')}`,
        '결제 회사 쪽 취소는 결제 회사 화면에서 따로 해 주세요.',
      ]}
      danger
      confirmLabel="환불"
      confirmDisabled={text.length === 0 || text.length > REASON_MAX}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <Field label="사유" as="textarea" name="reason" rows={2} maxLength={REASON_MAX} value={reason}
        onChange={(event) => setReason(event.target.value)} hint="관리자 기록에 남아요." />
    </ConfirmDialog>
  )
}
