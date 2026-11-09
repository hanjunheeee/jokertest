// 금지어 서버 부르기 파일, 목록 · 넣기 · 켜고 끄기 (/admin-api/banned-words)
// 금지어 화면(BannedWordsPage·AddWordForm)이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

// 비지 않은 값만 주소 뒤에 (예: { q:'욕', active:'' } → '?q=%EC%9A%95')
const queryOf = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

// → { items:[{ id, word, isActive, createdAt, updatedAt }], nextBefore }
export const fetchBannedWords = ({ q, active, before } = {}) => adminApi.get(`/banned-words${queryOf({ q, active, before })}`)

// → { word, nodes:[{ node, ok, code? }], partial }
export const addBannedWord = (word) => adminApi.send('POST', '/banned-words', { word })

export const setBannedWordActive = (id, isActive) => adminApi.send('PATCH', `/banned-words/${id}`, { isActive })
