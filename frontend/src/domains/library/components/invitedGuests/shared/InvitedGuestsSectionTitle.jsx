// 초대받은 손님 칸 제목 (h3 한 가지 모양)
// 직업 설명·내 전적·숙련도 랭킹 칸 컴포넌트가 씀
import { SECTION_TITLE_CLASS } from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"

// 받은 글자를 같은 제목 모양으로 감쌈
export default function InvitedGuestsSectionTitle({ children }) {
  return <h3 className={SECTION_TITLE_CLASS}>{children}</h3>
}