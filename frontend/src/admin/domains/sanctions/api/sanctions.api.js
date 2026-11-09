// 제재 경로 부르기 파일, 강제 접속 종료 · 정지 · 기간 바꾸기 · 해제 (전부 사유 필수)
// SanctionPanel·BanDialog가 부름
import { adminApi } from '@/admin/shared/api/adminClient'

const base = (uuid) => `/members/${encodeURIComponent(uuid)}`

// 응답: { disconnected, partial }
export const forceDisconnect = (uuid, reason) => adminApi.send('POST', `${base(uuid)}/force-disconnect`, { reason })

// period: { kind:'PERIOD', days } | { kind:'PERMANENT' } → 응답: { ban, disconnect:{ disconnected, partial } }
export const banMember = (uuid, period, reason) => adminApi.send('POST', `${base(uuid)}/bans`, { ...period, reason })

// 응답: { ban }
export const changeBan = (uuid, banId, period, reason) => adminApi.send('PATCH', `${base(uuid)}/bans/${banId}`, { ...period, reason })

// 응답: { liftedCount }
export const unbanMember = (uuid, reason) => adminApi.send('POST', `${base(uuid)}/unban`, { reason })
