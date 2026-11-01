export function getAriaLabel(view) {
  if (view === "request") return "친구 신청"
  if (view === "accept") return "친구 수락"
  if (view === "invite") return "게임 초대"
  if (view === "block") return "차단 목록"
  return "친구 목록"
}
