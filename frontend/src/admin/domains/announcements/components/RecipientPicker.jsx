// 공지 받을 사람 고르기 부품 파일, 닉네임·UUID로 찾아 넣고 빼기 (UUID는 찾기 없이 그대로 넣기도 됨)
// AnnouncementsPage가 "고른 사람" 대상일 때 씀
import { useState } from 'react'
import Field from '@/admin/shared/ui/Field'
import StatusNote from '@/admin/shared/ui/StatusNote'
import { searchMembers } from '@/admin/domains/announcements/api/announcements.api'

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const BUTTON = 'min-h-11 rounded border border-line px-3 text-sm hover:bg-page disabled:opacity-50'

// 회원 찾기 칸 상태, 2자 이상일 때만 찾음
function useMemberSearch() {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const text = query.trim()

  const search = async (event) => {
    event.preventDefault()
    if (text.length < 2) return
    setState('loading')
    setError(null)
    try {
      const page = await searchMembers(text)
      setFound(page.items ?? [])
      setState('done')
    } catch (caught) {
      setError(caught)
      setState('error')
    }
  }
  return { query, setQuery, found, state, error, text, search }
}

// 찾은 회원 목록, 이미 넣은 사람은 버튼 잠금
function FoundList({ found, pickedIds, onAdd }) {
  return (
    <ul aria-label="찾은 회원" className="flex flex-col gap-1">
      {found.map((member) => (
        <li key={member.uuid} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 break-all">{member.nickname} <span className="text-muted">{member.uuid}</span></span>
          <button type="button" className={BUTTON} disabled={pickedIds.has(member.uuid)} onClick={() => onAdd(member)}>
            {pickedIds.has(member.uuid) ? '넣음' : '넣기'}
          </button>
        </li>
      ))}
    </ul>
  )
}

// 고른 사람 수·목록, 하나씩 빼기
function PickedList({ picked, onRemove }) {
  return (
    <div>
      <p className="text-sm font-semibold">고른 사람 {picked.length}명</p>
      {picked.length === 0 ? <p className="text-sm text-muted">아직 고른 사람이 없어요. 위에서 찾아 넣어 주세요.</p> : (
        <ul aria-label="고른 사람 목록" className="mt-1 flex flex-wrap gap-2">
          {picked.map((member) => (
            <li key={member.uuid} className="flex items-center gap-1 rounded border border-line px-2 text-sm">
              <span className="break-all">{member.nickname ?? member.uuid}</span>
              <button type="button" className="min-h-11 px-2 text-muted" aria-label={`${member.nickname ?? member.uuid} 빼기`} onClick={() => onRemove(member.uuid)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// picked: [{ uuid, nickname }], onChange: 새 목록 받음
export default function RecipientPicker({ picked, onChange }) {
  const { query, setQuery, found, state, error, text, search } = useMemberSearch()
  const pickedIds = new Set(picked.map((member) => member.uuid))

  const add = (member) => {
    if (!pickedIds.has(member.uuid)) onChange([...picked, { uuid: member.uuid, nickname: member.nickname ?? null }])
  }
  const remove = (uuid) => onChange(picked.filter((member) => member.uuid !== uuid))

  return (
    <div className="flex flex-col gap-3 rounded border border-line p-3">
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <Field
          label="받을 사람 찾기"
          hint="닉네임 앞부분(2자 이상) 또는 UUID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1"
        />
        <button type="submit" className={BUTTON} disabled={text.length < 2 || state === 'loading'}>찾기</button>
        {UUID_PATTERN.test(text) ? (
          <button type="button" className={BUTTON} onClick={() => add({ uuid: text })}>이 UUID 그대로 넣기</button>
        ) : null}
      </form>

      {state === 'loading' ? <StatusNote state="loading" /> : null}
      {state === 'error' ? <StatusNote state="error" error={error} /> : null}
      {state === 'done' && found.length === 0 ? <StatusNote state="empty">찾은 회원이 없어요. 닉네임을 다시 확인해 주세요.</StatusNote> : null}
      {state === 'done' && found.length > 0 ? (
        <FoundList found={found} pickedIds={pickedIds} onAdd={add} />
      ) : null}

      <PickedList picked={picked} onRemove={remove} />
    </div>
  )
}
