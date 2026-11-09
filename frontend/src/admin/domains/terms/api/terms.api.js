// 약관 경로 부르기 파일, 버전 목록 · 새 버전 넣기 + 폼 값 → 보낼 몸(한국 시각 → UTC)
// TermsPage가 부름
import { adminApi } from '@/admin/shared/api/adminClient'

// 응답: { items:[{ id, kind, version, title, url, hasBody, effectiveAt, isRequired, isCurrent, agreedCount, createdAt }] }
export const fetchTerms = () => adminApi.get('/terms')

// 몸: { kind, version, title, body|null, url|null, effectiveAt(ISO), isRequired } → { terms }
export const createTerms = (input) => adminApi.send('POST', '/terms', input)

// 화면 칸(한국 시각 'YYYY-MM-DDTHH:mm') → 서버 ISO (예: '2026-12-01T00:00' → '2026-11-30T15:00:00.000Z'), 비면 ''
export const kstInputToIso = (value) => {
  if (!value) return ''
  const time = Date.parse(`${value}:00+09:00`)
  return Number.isNaN(time) ? '' : new Date(time).toISOString()
}

// 폼 → 서버로 보낼 몸 (앞뒤 빈칸 뺌, 빈 본문·주소는 null)
export const toTermsInput = (form) => ({
  kind: form.kind,
  version: form.version.trim(),
  title: form.title.trim(),
  body: form.body.trim() || null,
  url: form.url.trim() || null,
  effectiveAt: kstInputToIso(form.effectiveAt),
  isRequired: form.isRequired,
})
