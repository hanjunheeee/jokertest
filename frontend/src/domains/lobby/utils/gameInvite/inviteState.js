// 받은 게임 초대 상태 판정 (지금 누를 수 있는지·안내 문구, 수락 응답으로 방에 들어가도 되는지)
// 초대 탭의 초대 줄·초대 수락 흐름이 씀
import { INVITE_ENDED_REASON_TEXT } from "../../constants/gameInvite.js"

// 대기 중이고 안 지난 초대만 수락·거절 가능, 아니면 끝난 이유 문구를 줌
export function describeState(invite, now = Date.now()) {
  if (invite === null || invite === undefined) return { actionable: false, text: "초대를 찾을 수 없습니다." }
  if (invite.status !== "PENDING") {
    return { actionable: false, text: INVITE_ENDED_REASON_TEXT[invite.status] ?? "처리된 초대입니다." }
  }
  const expiresAt = Date.parse(invite.expiresAt ?? "")
  if (Number.isFinite(expiresAt) && expiresAt <= now) {
    return { actionable: false, text: INVITE_ENDED_REASON_TEXT.EXPIRED }
  }
  return { actionable: true, text: null }
}

// ok이고 방 id가 있는 응답만 입장으로 봄
export function canEnterRoom(result) {
    if (result === null || typeof result !== "object") return false;
    if (result.ok !== true) return false;
    const room = result.room;
    if (room === null || typeof room !== "object") return false;
    return typeof room.roomId === "string" && room.roomId.length > 0;
}
