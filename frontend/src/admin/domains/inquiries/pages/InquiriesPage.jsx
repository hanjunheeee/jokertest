// 문의 화면 파일, 상태별 문의 목록(50줄씩 더 보기) + 문의 하나 보기·답 달기(/inquiries/:id)
// 메뉴 "문의"(/inquiries/*)에 붙음, 문의 하나는 InquiryDetailPage
import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import PageHeader from '@/admin/shared/ui/PageHeader'
import DataList from '@/admin/shared/ui/DataList'
import Field from '@/admin/shared/ui/Field'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { CATEGORY_TEXT, STATUS_TEXT, fetchInquiries } from '@/admin/domains/inquiries/api/inquiries.api'
import InquiryDetailPage from '@/admin/domains/inquiries/pages/InquiryDetailPage'

// 고른 상태별 빈 목록 글
const EMPTY_TEXT = Object.freeze({
  OPEN: '답을 기다리는 문의가 없어요.',
  ANSWERED: '답한 문의가 없어요.',
  '': '아직 받은 문의가 없어요.',
})

const columns = [
  { key: 'createdAt', label: '받은 시각', render: (row) => formatKst(row.createdAt) },
  { key: 'category', label: '종류', render: (row) => CATEGORY_TEXT[row.category] ?? row.category },
  {
    key: 'title',
    label: '제목',
    render: (row) => <Link to={`/inquiries/${row.id}`} className="font-semibold underline">{row.title}</Link>,
  },
  {
    key: 'user',
    label: '쓴 사람',
    render: (row) => <Link to={`/members/${row.user.uuid}`} className="underline">{row.user.nickname ?? '(탈퇴)'}</Link>,
  },
  { key: 'status', label: '상태', render: (row) => STATUS_TEXT[row.status] ?? row.status },
  { key: 'replyCount', label: '답 수' },
]

function InquiryList() {
  const [status, setStatus] = useState('OPEN')
  const [list, setList] = useState({ state: 'loading', items: [], nextBefore: null, error: null })

  const load = useCallback(async (before) => {
    if (!before) setList((old) => ({ ...old, state: 'loading' }))
    try {
      const page = await fetchInquiries({ status, before })
      setList((old) => ({ state: 'ready', items: before ? [...old.items, ...page.items] : page.items, nextBefore: page.nextBefore, error: null }))
    } catch (error) {
      setList((old) => ({ ...old, state: 'error', error }))
    }
  }, [status])

  useEffect(() => { void load() }, [load])

  return (
    <section>
      <PageHeader title="문의" description="플레이어가 게임 안 문의 창으로 보낸 글이에요. 제목을 눌러 답을 달아요." />
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="상태" name="status" as="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="OPEN">답 기다림</option>
          <option value="ANSWERED">답함</option>
          <option value="">전부</option>
        </Field>
      </div>
      {list.state === 'loading' ? <StatusNote state="loading" /> : null}
      {list.state === 'error' ? <StatusNote state="error" error={list.error} onRetry={() => load()} /> : null}
      {list.state === 'ready' ? (
        <DataList columns={columns} rows={list.items} caption="문의 목록" empty={EMPTY_TEXT[status]} />
      ) : null}
      {list.state === 'ready' && list.nextBefore ? (
        <button type="button" onClick={() => load(list.nextBefore)} className="mt-3 min-h-11 rounded border border-line px-4">
          더 보기
        </button>
      ) : null}
    </section>
  )
}

export default function InquiriesPage() {
  return (
    <Routes>
      <Route index element={<InquiryList />} />
      <Route path=":id" element={<InquiryDetailPage />} />
    </Routes>
  )
}
