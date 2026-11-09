// 쿠폰 만들기 폼 파일, 코드·보상(골드/다이아·양)·횟수·기간 → 만들기 (서버가 규칙 어긴 칸을 알려 주면 그 칸 옆에 표시)
// 쿠폰 화면(CouponsPage)이 씀, 기간은 한국 시각으로 받고 서버엔 UTC로 보냄
import { useState } from 'react'
import Field from '@/admin/shared/ui/Field'
import { adminErrorText } from '@/admin/shared/api/errorText'
import { createCoupon } from '@/admin/domains/coupons/api/coupons.api'

const BUTTON = 'min-h-11 rounded px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50'
const EMPTY = Object.freeze({ code: '', rewardType: 'GOLD', rewardAmount: '', maxUses: '', startsAt: '', endsAt: '' })
const FIELD_TEXT = Object.freeze({
  code: '영문 대문자·숫자·- 4~40자로 적어 주세요.',
  rewardAmount: '1 이상 10억 이하 정수로 적어 주세요.',
  maxUses: '비우거나 1 이상 정수로 적어 주세요.',
  startsAt: '날짜·시각을 다시 골라 주세요.',
  endsAt: '끝 시각은 시작 시각 뒤로 골라 주세요.',
})

// 날짜·시각 칸(한국 시각, 'YYYY-MM-DDTHH:mm') → UTC ISO, 비면 null (예: '2026-11-10T09:00' → '2026-11-10T00:00:00.000Z')
const kstToIso = (text) => {
  if (!text) return null
  const date = new Date(`${text}:00+09:00`)
  return Number.isNaN(date.getTime()) ? text : date.toISOString()
}

// 숫자 칸 글자 → 정수, 비면 null, 정수 모양 아니면 글자 그대로 (서버가 칸 이름으로 알려 줌)
const toNumber = (text) => {
  const trimmed = String(text).trim()
  if (trimmed === '') return null
  return /^\d{1,10}$/.test(trimmed) ? Number(trimmed) : trimmed
}

export default function CouponForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const change = (key) => (event) => {
    const { value } = event.target
    setForm((old) => ({ ...old, [key]: value }))
  }
  const fieldError = (key) => (error?.code === 'INVALID_COUPON' && error.details?.field === key ? FIELD_TEXT[key] ?? '값을 다시 확인해 주세요.' : null)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { coupon } = await createCoupon({
        code: form.code.trim().toUpperCase(),
        rewardType: form.rewardType,
        rewardAmount: toNumber(form.rewardAmount),
        maxUses: toNumber(form.maxUses),
        startsAt: kstToIso(form.startsAt),
        endsAt: kstToIso(form.endsAt),
      })
      onCreated(coupon)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label="새 쿠폰" className="mb-6 flex flex-col gap-3 rounded border border-line bg-panel p-4">
      <h2 className="text-lg font-bold">새 쿠폰</h2>
      <Field label="쿠폰 코드" name="code" value={form.code} onChange={change('code')} error={fieldError('code')} hint="예: WELCOME-2026 (대문자로 저장)" maxLength={40} />
      <div className="flex flex-wrap gap-3">
        <Field label="보상" name="rewardType" as="select" value={form.rewardType} onChange={change('rewardType')} className="basis-32">
          <option value="GOLD">골드</option>
          <option value="DIAMOND">다이아</option>
        </Field>
        <Field label="보상 양" name="rewardAmount" inputMode="numeric" value={form.rewardAmount} onChange={change('rewardAmount')}
          error={fieldError('rewardAmount')} className="min-w-0 flex-1 basis-32" />
        <Field label="쓸 수 있는 횟수" name="maxUses" inputMode="numeric" value={form.maxUses} onChange={change('maxUses')}
          error={fieldError('maxUses')} hint="비우면 제한 없음 (한 사람은 한 번만)" className="min-w-0 flex-1 basis-40" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label="시작 시각(한국)" name="startsAt" type="datetime-local" value={form.startsAt} onChange={change('startsAt')} error={fieldError('startsAt')} hint="비우면 바로" />
        <Field label="끝 시각(한국)" name="endsAt" type="datetime-local" value={form.endsAt} onChange={change('endsAt')} error={fieldError('endsAt')} hint="비우면 끝 없음" />
      </div>
      {error && error.code !== 'INVALID_COUPON' ? <p role="alert" className="text-sm text-danger">{adminErrorText(error)}</p> : null}
      {error?.code === 'INVALID_COUPON' ? <p role="alert" className="text-sm text-danger">표시된 칸을 고쳐 주세요.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !form.code.trim() || !form.rewardAmount.trim()} className={`${BUTTON} bg-accent text-accent-ink`}>
          {busy ? '만드는 중…' : '만들기'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={`${BUTTON} border border-line`}>취소</button>
      </div>
    </form>
  )
}
