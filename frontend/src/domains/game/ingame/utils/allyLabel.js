// 같은 직업 동료 글 만들기: 카드 표시 글("동료 의사")과 읽기 이름("민수 · 동료 의사") (상태를 안 건드리는 순수 계산)
// 밤 대상 목록·PC 카드 판·모바일 초상 띠와 카드 판이 사용 (동료 표시는 내 화면에만, 시민은 동료 없음)
import { getRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"

// 동료 표시 글: 동료가 아니거나 내 직업 이름을 모르면 null
// 예: ({ isAlly: true }, "DOCTOR") → "동료 의사", ({ isAlly: true }, undefined) → null, ({}, "DOCTOR") → null
export function allyText(player, selfRole) {
  if (player?.isAlly !== true) return null
  const roleName = getRoleRevealDisplay(selfRole)?.name ?? null
  return roleName ? `동료 ${roleName}` : null
}

// 읽기 이름: 동료면 닉네임 뒤에 동료 글을 붙임 (화면 읽기 프로그램이 누구인지 알게)
// 예: ({ nickname: "민수", isAlly: true }, "DOCTOR") → "민수 · 동료 의사", ({ nickname: "민수" }, "DOCTOR") → "민수"
export function allyReadingName(player, selfRole) {
  const ally = allyText(player, selfRole)
  return ally ? `${player.nickname} · ${ally}` : player?.nickname ?? ""
}
