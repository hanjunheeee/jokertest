// 상품 만들기·고치기 폼 파일, 값 칸 + 저장 (서버가 규칙 어긴 칸을 알려 주면 그 칸 옆에 표시)
// 상품 화면(ProductsPage)이 씀: product 없으면 새로 만들기, 있으면 고치기(그 판 번호로)
import { useState } from 'react'
import Field from '@/admin/shared/ui/Field'
import { adminErrorText } from '@/admin/shared/api/errorText'
import { createProduct, KIND_LABELS, STATUS_LABELS, updateProduct } from '@/admin/domains/products/api/products.api'

const BUTTON = 'min-h-11 rounded px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50'
const NUMBER_FIELDS = ['payAmount', 'grantAmount', 'bonusAmount', 'sortOrder']
const EDITABLE = ['displayName', 'payAmount', 'grantAmount', 'bonusAmount', 'status', 'sortOrder']
const FIELD_TEXT = Object.freeze({
  productId: '영문·숫자·-·_ 64자까지로 적어 주세요.',
  displayName: '이름을 100자까지로 적어 주세요.',
  payAmount: '1 이상 10억 이하 정수로 적어 주세요.',
  grantAmount: '1 이상 정수, 덤과 합쳐 10억 이하로 적어 주세요.',
  bonusAmount: '0 이상 정수로 적어 주세요.',
  sortOrder: '정수로 적어 주세요.',
})

const EMPTY = Object.freeze({
  productId: '', kind: 'DIAMOND_TOPUP', displayName: '', payAmount: '', grantAmount: '', bonusAmount: '0', status: 'ON_SALE', sortOrder: '0',
})

// 숫자 칸 글자 → 정수 (정수 모양 아니면 글자 그대로 보내 서버가 칸 이름으로 알려 줌, 예: '1100' → 1100, '1.5' → '1.5')
const toNumber = (text) => (/^-?\d{1,10}$/.test(String(text).trim()) ? Number(text) : text)

const toForm = (product) => (product
  ? Object.fromEntries(Object.keys(EMPTY).map((key) => [key, String(product[key] ?? '')]))
  : { ...EMPTY })

const toBody = (form, keys) => Object.fromEntries(keys.map((key) => [key, NUMBER_FIELDS.includes(key) ? toNumber(form[key]) : form[key]]))

// 새 상품일 때만: 상품 id·종류 칸
function NewProductIdFields({ form, change, fieldError }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Field label="상품 id" name="productId" value={form.productId} onChange={change('productId')} error={fieldError('productId')}
        hint="예: diamond-1100 (나중에 못 바꿈)" className="min-w-0 flex-1 basis-48" />
      <Field label="종류" name="kind" as="select" value={form.kind} onChange={change('kind')} className="basis-56">
        {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Field>
    </div>
  )
}

// 값·받는 양·덤·순서 칸 (금 사기 상품은 값이 다이아)
function AmountFields({ form, change, fieldError, editing, product }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label={(editing ? product.kind : form.kind) === 'GOLD_PURCHASE' ? '값(다이아)' : '값(원)'} name="payAmount" inputMode="numeric"
        value={form.payAmount} onChange={change('payAmount')} error={fieldError('payAmount')} />
      <Field label="받는 양" name="grantAmount" inputMode="numeric" value={form.grantAmount} onChange={change('grantAmount')} error={fieldError('grantAmount')} />
      <Field label="덤" name="bonusAmount" inputMode="numeric" value={form.bonusAmount} onChange={change('bonusAmount')} error={fieldError('bonusAmount')} />
      <Field label="순서" name="sortOrder" inputMode="numeric" value={form.sortOrder} onChange={change('sortOrder')} error={fieldError('sortOrder')} />
    </div>
  )
}

export default function ProductForm({ product, onSaved, onCancel }) {
  const editing = Boolean(product)
  const [form, setForm] = useState(() => toForm(product))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const change = (key) => (event) => {
    const { value } = event.target
    setForm((old) => ({ ...old, [key]: value }))
  }

  const fieldError = (key) => (error?.code === 'INVALID_PRODUCT' && error.details?.field === key ? FIELD_TEXT[key] ?? '값을 다시 확인해 주세요.' : null)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = editing
        ? await updateProduct(product.productId, product.version, toBody(form, EDITABLE))
        : await createProduct({ ...toBody(form, ['productId', 'kind', ...EDITABLE]), displayName: form.displayName.trim() })
      onSaved(saved.product)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label={editing ? '상품 고치기' : '새 상품'} className="mb-6 flex flex-col gap-3 rounded border border-line bg-panel p-4">
      <h2 className="text-lg font-bold">{editing ? `상품 고치기 — ${product.productId} (${product.version}판)` : '새 상품'}</h2>
      {editing ? null : (
        <NewProductIdFields form={form} change={change} fieldError={fieldError} />
      )}
      <Field label="이름" name="displayName" value={form.displayName} onChange={change('displayName')} error={fieldError('displayName')} maxLength={100} />
      <AmountFields form={form} change={change} fieldError={fieldError} editing={editing} product={product} />
      <Field label="판매" name="status" as="select" value={form.status} onChange={change('status')}>
        {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Field>
      {editing ? <p className="text-sm text-muted">저장하면 판 번호가 올라가요. 이미 만든 주문은 그때 값 그대로예요.</p> : null}
      {error && error.code !== 'INVALID_PRODUCT' ? <p role="alert" className="text-sm text-danger">{adminErrorText(error)}</p> : null}
      {error?.code === 'INVALID_PRODUCT' ? <p role="alert" className="text-sm text-danger">표시된 칸을 고쳐 주세요.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={`${BUTTON} bg-accent text-accent-ink`}>{busy ? '저장 중…' : '저장'}</button>
        <button type="button" onClick={onCancel} disabled={busy} className={`${BUTTON} border border-line`}>취소</button>
      </div>
    </form>
  )
}
