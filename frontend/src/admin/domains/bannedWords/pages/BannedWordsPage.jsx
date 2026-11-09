// 금지어 화면 파일, 목록(찾기·켜짐 거르기·더 보기) + 넣기 + 켜고 끄기 + 서버(Node)별 반영 결과
// 메뉴 표(adminRoutes)가 /banned-words에 붙임
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import DataList from '@/admin/shared/ui/DataList'
import Field from '@/admin/shared/ui/Field'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { formatKst } from '@/admin/shared/utils/time'
import { adminErrorText } from '@/admin/shared/api/errorText'
import AddWordForm from '@/admin/domains/bannedWords/components/AddWordForm'
import { fetchBannedWords, setBannedWordActive } from '@/admin/domains/bannedWords/api/bannedWords.api'

// 반영 결과 한 줄 (예: { word:'욕', partial:true, nodes:[{node:'n1',ok:true},{node:'n2',ok:false}] } → 'n2 반영 안 됨')
function ReloadNote({ change }) {
  if (!change) return null
  const failed = change.nodes.filter((node) => !node.ok).map((node) => node.node)
  const action = change.isActive ? '켰어요' : '껐어요'
  return (
    <div role="status" className={`mb-4 rounded border px-3 py-2 text-sm ${failed.length ? 'border-danger/40' : 'border-line bg-panel'}`}>
      <p>'{change.word}' 금지어를 {action}.</p>
      <ul className="mt-1 flex flex-wrap gap-x-4">
        {change.nodes.map((node) => (
          <li key={node.node} className={node.ok ? 'text-muted' : 'text-danger'}>
            {node.node} {node.ok ? '반영됨' : '반영 안 됨'}
          </li>
        ))}
      </ul>
      {failed.length ? <p className="mt-1 text-muted">반영 안 된 서버도 1분 안에 스스로 다시 읽어요.</p> : null}
    </div>
  )
}

function ToggleButton({ row, onToggle }) {
  const [busy, setBusy] = useState(false)
  const click = async () => {
    setBusy(true)
    try {
      await onToggle(row)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={click} disabled={busy} aria-label={`${row.word} ${row.isActive ? '끄기' : '켜기'}`}
      className="min-h-11 rounded border border-line px-3 disabled:opacity-50">
      {busy ? '바꾸는 중…' : row.isActive ? '끄기' : '켜기'}
    </button>
  )
}

// 목록 불러오기 (거르기 바뀌면 처음부터, before 주면 뒤에 이어 붙임) → { list, load }
function useWordList(filter) {
  const [list, setList] = useState({ state: 'loading', items: [], nextBefore: null, error: null })
  const load = useCallback(async (before) => {
    if (!before) setList((old) => ({ ...old, state: 'loading' }))
    try {
      const page = await fetchBannedWords({ ...filter, before })
      setList((old) => ({ state: 'ready', items: before ? [...old.items, ...page.items] : page.items, nextBefore: page.nextBefore, error: null }))
    } catch (error) {
      setList((old) => ({ ...old, state: 'error', error }))
    }
  }, [filter])
  useEffect(() => { void load() }, [load])
  return { list, load }
}

export default function BannedWordsPage() {
  const [filter, setFilter] = useState({ q: '', active: '' })
  const { list, load } = useWordList(filter)
  const [change, setChange] = useState(null)
  const [actionError, setActionError] = useState(null)

  const afterChange = (result) => {
    setActionError(null)
    setChange({ word: result.word.word, isActive: result.word.isActive, nodes: result.nodes })
    void load()
  }

  const toggle = async (row) => {
    try {
      afterChange(await setBannedWordActive(row.id, !row.isActive))
    } catch (error) {
      setActionError(error)
    }
  }

  const columns = [
    { key: 'word', label: '단어' },
    { key: 'isActive', label: '상태', render: (row) => (row.isActive ? '켜짐' : '꺼짐') },
    { key: 'updatedAt', label: '바꾼 시각', render: (row) => formatKst(row.updatedAt) },
    { key: 'action', label: '바꾸기', render: (row) => <ToggleButton row={row} onToggle={toggle} /> },
  ]

  return (
    <section>
      <PageHeader title="금지어" description="넣거나 끄면 게임 서버 전부가 바로 다시 읽어요." />
      <AddWordForm onAdded={afterChange} />
      <ReloadNote change={change} />
      {actionError ? <p role="alert" className="mb-4 text-sm text-danger">{adminErrorText(actionError)}</p> : null}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="찾기" name="q" type="search" className="min-w-0 flex-1 basis-48" value={filter.q}
          onChange={(event) => setFilter((old) => ({ ...old, q: event.target.value }))} />
        <Field label="상태" name="active" as="select" value={filter.active}
          onChange={(event) => setFilter((old) => ({ ...old, active: event.target.value }))}>
          <option value="">전부</option>
          <option value="true">켜짐</option>
          <option value="false">꺼짐</option>
        </Field>
      </div>
      {list.state === 'loading' ? <StatusNote state="loading" /> : null}
      {list.state === 'error' ? <StatusNote state="error" error={list.error} onRetry={() => load()} /> : null}
      {list.state === 'ready' ? (
        <DataList columns={columns} rows={list.items} caption="금지어 목록"
          empty={filter.q || filter.active ? '맞는 금지어가 없어요.' : '아직 금지어가 없어요. 위 칸에 넣어 주세요.'} />
      ) : null}
      {list.state === 'ready' && list.nextBefore ? (
        <button type="button" onClick={() => load(list.nextBefore)} className="mt-3 min-h-11 rounded border border-line px-4">
          더 보기
        </button>
      ) : null}
    </section>
  )
}
