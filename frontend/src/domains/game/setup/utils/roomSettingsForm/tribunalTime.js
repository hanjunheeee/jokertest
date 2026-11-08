// 재판 시간 칸 → 요청에 실을 값 (낮 투표 시간과 같으면 안 실음 = 서버가 낮 투표 시간을 씀)
// buildCreateRoomPayload·updatePayload가 씀, 사용자 결정 2026-11-09
import { DAY_VOTE_TIME_ID, TRIBUNAL_TIME_ID } from "../../constants/roomSettingsForm.js"

// 실을 재판 시간 (정수 아님·낮 투표와 같음이면 null)
export function pickTribunalTime(ranges) {
  const tribunalTime = ranges?.[TRIBUNAL_TIME_ID]
  if (!Number.isInteger(tribunalTime)) return null
  if (tribunalTime === ranges?.[DAY_VOTE_TIME_ID]) return null
  return tribunalTime
}
