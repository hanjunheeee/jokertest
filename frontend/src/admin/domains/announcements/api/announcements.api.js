// 공지 경로 부르기 파일, 공지 보내기 + 받을 사람 찾기(회원 찾기 경로)
// AnnouncementsPage·RecipientPicker가 씀
import { adminApi } from '@/admin/shared/api/adminClient'

// 몸: { requestId, title, body, target:'online' } 또는 { ..., target:'users', userUuids }
// 응답: { result:{ recipientCount, created, duplicated, failed }, auditId }
export const sendAnnouncement = (payload) => adminApi.send('POST', '/announcements', payload)

// 닉네임 앞부분·UUID·이메일로 회원 찾기 → { items:[{ uuid, nickname, ... }], nextBefore }
export const searchMembers = (q) => adminApi.get(`/members?${new URLSearchParams({ q, limit: '20' })}`)
