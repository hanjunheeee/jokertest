// 금지어 넣기 칸 파일, 단어 하나 넣고 보내면 결과(Node별 반영)를 위로 알림
// BannedWordsPage가 맨 위에 씀, "이미 있음"이면 칸 옆에 글귀
import { useState } from 'react'
import Field from '@/admin/shared/ui/Field'
import { adminErrorText } from '@/admin/shared/api/errorText'
import { addBannedWord } from '@/admin/domains/bannedWords/api/bannedWords.api'

const MAX_LENGTH = 100

// 오류 → 칸 옆 글귀 (이미 있음은 꺼진 것인지까지)
const errorTextOf = (error) => {
  if (error?.code === 'BANNED_WORD_EXISTS') {
    return error.details?.isActive === false ? '이미 있는 단어예요. 꺼져 있으니 목록에서 켜 주세요.' : '이미 있는 단어예요.'
  }
  return adminErrorText(error)
}

// onAdded(결과): 넣은 뒤 목록 새로 고침·반영 결과 보여 주기
export default function AddWordForm({ onAdded }) {
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ready = word.trim() !== '' && !busy

  const submit = async (event) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const result = await addBannedWord(word.trim())
      setWord('')
      onAdded?.(result)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mb-4 flex flex-wrap items-end gap-2 rounded border border-line bg-panel p-3">
      <Field label="넣을 금지어" name="word" className="min-w-0 flex-1 basis-56" maxLength={MAX_LENGTH}
        hint="채팅에선 *로 가려지고, 이 단어가 든 닉네임은 못 써요." error={error ? errorTextOf(error) : undefined}
        value={word} onChange={(event) => setWord(event.target.value)} />
      <button type="submit" disabled={!ready}
        className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? '넣는 중…' : '넣기'}
      </button>
    </form>
  )
}
