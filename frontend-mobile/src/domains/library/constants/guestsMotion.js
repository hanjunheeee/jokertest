// 초대받은 자들 칸 등장 움직임 props (데스크톱 invitedGuests/entranceMotion 값 그대로, 칸마다 늦는 시간만 다름)
// guests/ 아래 직업 탭·직업 소개·전적·랭킹·도전과제 칸이 씀
import {
  REVEAL_ANIMATE,
  REVEAL_DELAYS,
  REVEAL_INIT,
  revealTransition,
} from "@/domains/library/constants/invitedGuests/entranceMotion.js"

// 칸 이름(REVEAL_DELAYS 키)으로 motion props 한 벌 만듦
export function revealProps(cell) {
  return { initial: REVEAL_INIT, animate: REVEAL_ANIMATE, transition: revealTransition(REVEAL_DELAYS[cell]) }
}
