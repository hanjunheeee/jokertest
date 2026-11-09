// 상품 화면 파일, 다이아·골드 상품 목록 + 새 상품 + 고치기(값·수량·판매 켜고 끄기)
// 메뉴 표(adminRoutes)가 /products에 붙임, 저장하면 상점에 바로 보임 (게임 서버가 주문 때마다 DB를 읽음)
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import DataList from '@/admin/shared/ui/DataList'
import StatusNote from '@/admin/shared/ui/StatusNote'
import ProductForm from '@/admin/domains/products/components/ProductForm'
import { fetchProducts, KIND_LABELS, STATUS_LABELS } from '@/admin/domains/products/api/products.api'

// 값 글자 (예: { payCurrency:'KRW', payAmount:1100 } → '1,100원', DIAMOND면 '다이아 30')
const priceText = (row) => (row.payCurrency === 'KRW' ? `${row.payAmount.toLocaleString('ko-KR')}원` : `다이아 ${row.payAmount.toLocaleString('ko-KR')}`)
const grantText = (row) => {
  const name = row.grantCurrency === 'GOLD' ? '골드' : '다이아'
  return `${name} ${row.grantAmount.toLocaleString('ko-KR')}${row.bonusAmount ? ` + 덤 ${row.bonusAmount.toLocaleString('ko-KR')}` : ''}`
}

// 목록 칸: 이름·종류·값·받는 양·판매·판·고치기 버튼
function productColumns(setEditor) {
  return [
    { key: 'displayName', label: '이름', render: (row) => `${row.displayName}${row.valid ? '' : ' (규칙 어김: 상점에 안 보임)'}` },
    { key: 'kind', label: '종류', render: (row) => KIND_LABELS[row.kind] ?? row.kind },
    { key: 'price', label: '값', render: priceText },
    { key: 'grant', label: '받는 양', render: grantText },
    { key: 'status', label: '판매', render: (row) => STATUS_LABELS[row.status] ?? row.status },
    { key: 'version', label: '판', render: (row) => row.version },
    {
      key: 'edit', label: '고치기', render: (row) => (
        <button type="button" onClick={() => setEditor({ mode: 'edit', product: row })} aria-label={`${row.displayName} 고치기`}
          className="min-h-11 rounded border border-line px-3">고치기</button>
      ),
    },
  ]
}

export default function ProductsPage() {
  const [list, setList] = useState({ state: 'loading', items: [], error: null })
  // 폼: null(닫힘) · { mode:'new' } · { mode:'edit', product }
  const [editor, setEditor] = useState(null)
  const [saved, setSaved] = useState(null)

  const load = useCallback(async () => {
    try {
      const { items } = await fetchProducts()
      setList({ state: 'ready', items, error: null })
    } catch (error) {
      setList((old) => ({ ...old, state: 'error', error }))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const afterSave = (product) => {
    setEditor(null)
    setSaved(product)
    void load()
  }

  const columns = productColumns(setEditor)

  return (
    <section>
      <PageHeader title="상품" description="값·수량·판매를 바꾸면 상점에 바로 보여요. 지우는 대신 판매 중지로 바꿔요."
        actions={editor ? null : (
          <button type="button" onClick={() => setEditor({ mode: 'new' })} className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink">새 상품</button>
        )} />
      {editor ? (
        <ProductForm key={editor.product?.productId ?? 'new'} product={editor.product} onSaved={afterSave} onCancel={() => setEditor(null)} />
      ) : null}
      {saved ? <p role="status" className="mb-4 text-sm">'{saved.displayName}' 저장했어요 ({saved.version}판).</p> : null}
      {list.state === 'loading' ? <StatusNote state="loading" /> : null}
      {list.state === 'error' ? <StatusNote state="error" error={list.error} onRetry={load} /> : null}
      {list.state === 'ready' ? (
        <DataList columns={columns} rows={list.items} rowKey="productId" caption="상품 목록" empty="아직 상품이 없어요. 새 상품을 만들어 주세요." />
      ) : null}
    </section>
  )
}
