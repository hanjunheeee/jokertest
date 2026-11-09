// 회원 경로 부르기 파일, 회원 찾기(q·커서) · 회원 상세 · 이메일 전체 보기
// MembersPage·MemberDetailPage가 부름
import { adminApi } from '@/admin/shared/api/adminClient'

// 응답: { items:[{ uuid, nickname, emailMasked, status, online, banned, withdrawn, createdAt }], nextBefore }
// 예: ({ q:'가면', before:'가면12' }) → '/members?q=%EA%B0%80%EB%A9%B4&before=…'
export const searchMembers = ({ q, before }) => {
  const query = new URLSearchParams({ q })
  if (before) query.set('before', before)
  return adminApi.get(`/members?${query}`)
}

// 응답: { member, bans, reportsReceived, logins }
export const fetchMember = (uuid) => adminApi.get(`/members/${encodeURIComponent(uuid)}`)

// 응답: { email } (서버가 "개인정보 보기" 기록을 남김)
export const revealMemberEmail = (uuid) => adminApi.send('POST', `/members/${encodeURIComponent(uuid)}/reveal-email`)
