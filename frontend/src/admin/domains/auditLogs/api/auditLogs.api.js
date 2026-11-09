// 처리 이력 경로 부르기 파일, 이력 목록 · 관리자 목록(누가 거르기) · 회원 찾기(회원으로 거르기)
// AuditLogsPage가 씀
import { adminApi } from '@/admin/shared/api/adminClient'

// 빈 값은 빼고 주소 글자로 (예: { kind:'announce', adminId:'' } → 'kind=announce')
const queryOf = (filters) => new URLSearchParams(
  Object.entries(filters).filter(([, value]) => value !== null && value !== undefined && value !== ''),
).toString()

// filters: { kind, memberUuid, adminId, from, to, before } → { items, nextBefore }
export const fetchAuditLogs = (filters) => adminApi.get(`/audit-logs?${queryOf(filters)}`)

// → { items:[{ id, loginId }] }
export const fetchAdmins = () => adminApi.get('/admins')

// 닉네임 앞부분·UUID로 회원 찾기 → { items:[{ uuid, nickname, ... }] }
export const searchMembers = (q) => adminApi.get(`/members?${new URLSearchParams({ q, limit: '20' })}`)
