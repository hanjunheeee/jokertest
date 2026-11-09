// 점검 서버 부르기 파일, 보기 · 저장 (/admin-api/maintenance) + 입력 칸(한국 시각) ↔ 서버 시각(UTC) 바꾸기
// 점검 화면(MaintenancePage)이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// → { maintenance:{ enabled, active, message, startsAt, endsAt, updatedAt }, liveGames, liveRooms, liveNodes, forceEnds }
export const fetchMaintenance = ({ background = false } = {}) => adminApi.get('/maintenance', { background })

// → { maintenance, nodes:[{ node, ok, code? }], partial }
export const saveMaintenance = (body) => adminApi.send('PUT', '/maintenance', body)

const pad = (value) => String(value).padStart(2, '0')

// 서버 시각 → 시각 칸 값(한국 시각), 예: '2026-11-10T03:00:00.000Z' → '2026-11-10T12:00', 빈 값 → ''
export const isoToKstInput = (iso) => {
  if (!iso) return ''
  const kst = new Date(Date.parse(iso) + KST_OFFSET_MS)
  if (Number.isNaN(kst.getTime())) return ''
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`
}

// 시각 칸 값(한국 시각) → 서버 시각, 예: '2026-11-10T12:00' → '2026-11-10T03:00:00.000Z', 빈 값·틀린 값 → null
export const kstInputToIso = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? '')
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS).toISOString()
}

// 폼 → 켜기(예약) 요청 몸, 문구는 앞뒤 빈칸 뺌
export const toScheduleBody = (form) => ({
  enabled: true,
  message: form.message.trim() || null,
  startsAt: kstInputToIso(form.startsAt),
  endsAt: kstInputToIso(form.endsAt),
})

export const OFF_BODY = Object.freeze({ enabled: false, message: null, startsAt: null, endsAt: null })
