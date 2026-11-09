// 회원 상세 안 골드·다이아 칸 파일, 지금 잔액 + 최근 장부 + 주기/뺏기(금액·사유 → 확인 창)
// 1-1 회원 상세 화면이 <WalletPanel uuid /> 로 붙임, 돈은 서버 장부로만 바뀜 (화면은 결과 숫자만 다시 읽음)
import { useCallback, useEffect, useState } from 'react'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import DataList from '@/admin/shared/ui/DataList'
import Field from '@/admin/shared/ui/Field'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { newRequestId } from '@/admin/shared/utils/requestId'
import { adjustWallet, currencyLabel, fetchWallet, ledgerReasonLabel, signedAmount } from '@/admin/domains/wallet/api/wallet.api'

const BUTTON = 'min-h-11 rounded px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50'
const REASON_MAX = 200

const columns = [
  { key: 'createdAt', label: '시각', render: (row) => formatKst(row.createdAt) },
  { key: 'reason', label: '사유', render: (row) => ledgerReasonLabel(row.reason) },
  { key: 'amount', label: '양', render: (row) => `${currencyLabel(row.currency)} ${signedAmount(row.amount)}` },
  { key: 'balanceAfter', label: '남은 양', render: (row) => row.balanceAfter.toLocaleString('ko-KR') },
]

// 금액 칸 글자 → 1 이상 정수 또는 null (예: '500' → 500, '0'·'1.5'·'' → null)
const positiveAmount = (text) => (/^[1-9]\d{0,9}$/.test(text) && Number(text) <= 1_000_000_000 ? Number(text) : null)

// 재화·금액·사유 칸 + 주기·뺏기 버튼
function AdjustFields({ form, change, amount, ready, open }) {
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Field label="재화" as="select" name="currency" value={form.currency} onChange={change('currency')} className="basis-32">
          <option value="GOLD">골드</option>
          <option value="DIAMOND">다이아</option>
        </Field>
        <Field label="금액" name="amount" inputMode="numeric" value={form.amount} onChange={change('amount')}
          hint="1 이상 정수" error={form.amount && amount === null ? '1 이상 10억 이하 정수로 적어 주세요.' : null} className="min-w-0 flex-1 basis-40" />
      </div>
      <Field label="사유" as="textarea" name="reason" rows={2} maxLength={REASON_MAX} value={form.reason} onChange={change('reason')}
        hint="회원 기록에 남아요. 예: 버그로 잃은 골드 보상" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!ready} onClick={() => open('grant')} className={`${BUTTON} bg-accent text-accent-ink`}>주기</button>
        <button type="button" disabled={!ready} onClick={() => open('revoke')} className={`${BUTTON} bg-danger text-danger-ink`}>뺏기</button>
      </div>
    </>
  )
}

function AdjustForm({ uuid, onDone }) {
  const [form, setForm] = useState({ currency: 'GOLD', amount: '', reason: '' })
  // 금액·재화가 바뀌면 새 요청 번호 (같은 번호에 다른 내용이면 서버가 409로 막음)
  const [requestId, setRequestId] = useState(newRequestId)
  const [confirming, setConfirming] = useState(null)

  const change = (key) => (event) => {
    const { value } = event.target
    setForm((old) => ({ ...old, [key]: value }))
    if (key !== 'reason') setRequestId(newRequestId())
  }

  const amount = positiveAmount(form.amount)
  const reason = form.reason.trim()
  const ready = amount !== null && reason.length > 0 && reason.length <= REASON_MAX

  const open = (direction) => {
    if (direction !== confirming?.direction) setRequestId(newRequestId())
    setConfirming({ direction })
  }

  const confirm = async () => {
    const signed = confirming.direction === 'revoke' ? -amount : amount
    const result = await adjustWallet(uuid, { requestId, currency: form.currency, amount: signed, reason })
    setConfirming(null)
    setForm((old) => ({ ...old, amount: '', reason: '' }))
    setRequestId(newRequestId())
    onDone(result)
  }

  const revoke = confirming?.direction === 'revoke'
  return (
    <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => event.preventDefault()} aria-label="골드·다이아 주고 뺏기">
      <AdjustFields form={form} change={change} amount={amount} ready={ready} open={open} />
      {confirming ? (
        <ConfirmDialog
          title={revoke ? '정말 뺏을까요?' : '정말 줄까요?'}
          lines={[`재화: ${currencyLabel(form.currency)}`, `금액: ${revoke ? '-' : '+'}${amount.toLocaleString('ko-KR')}`, `사유: ${reason}`]}
          danger={revoke}
          confirmLabel={revoke ? '뺏기' : '주기'}
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </form>
  )
}

export default function WalletPanel({ uuid }) {
  const [wallet, setWallet] = useState({ state: 'loading', value: null, error: null })
  const [done, setDone] = useState(null)

  const load = useCallback(async () => {
    try {
      const value = await fetchWallet(uuid)
      setWallet({ state: 'ready', value, error: null })
    } catch (error) {
      setWallet((old) => ({ ...old, state: 'error', error }))
    }
  }, [uuid])

  useEffect(() => { if (uuid) void load() }, [uuid, load])

  if (!uuid) return null
  const afterAdjust = (result) => {
    setDone(result.ledgerEntry)
    void load()
  }

  return (
    <section aria-labelledby="wallet-title" className="mt-6 rounded border border-line bg-panel p-4">
      <h2 id="wallet-title" className="text-lg font-bold">골드·다이아</h2>
      {wallet.state === 'loading' ? <StatusNote state="loading" /> : null}
      {wallet.state === 'error' ? <StatusNote state="error" error={wallet.error} onRetry={load} /> : null}
      {wallet.state === 'ready' ? (
        <>
          <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1">
            <div><dt className="text-sm text-muted">골드</dt><dd data-testid="wallet-gold" className="text-xl font-bold">{wallet.value.gold.toLocaleString('ko-KR')}</dd></div>
            <div><dt className="text-sm text-muted">다이아</dt><dd data-testid="wallet-diamond" className="text-xl font-bold">{wallet.value.diamond.toLocaleString('ko-KR')}</dd></div>
          </dl>
          {done ? (
            <p role="status" className="mt-2 text-sm">
              {currencyLabel(done.currency)} {signedAmount(done.amount)} 처리했어요. 남은 양 {done.balanceAfter.toLocaleString('ko-KR')}
            </p>
          ) : null}
          <AdjustForm uuid={uuid} onDone={afterAdjust} />
          <h3 className="mb-2 mt-5 font-semibold">최근 장부</h3>
          <DataList columns={columns} rows={wallet.value.ledger} caption="최근 장부" empty="아직 장부 줄이 없어요." />
        </>
      ) : null}
    </section>
  )
}
