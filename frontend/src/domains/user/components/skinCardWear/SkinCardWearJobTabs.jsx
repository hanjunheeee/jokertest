// 스킨·카드 장착 창 직업 탭 (서고 초대 손님 탭을 같이 씀)
// SkinCardWearPanel이 씀
import InvitedGuestsJobTabs from "../../../library/components/invitedGuests/left/InvitedGuestsJobTabs.jsx"
import {
  JOB_TABS_ANCHOR_CLASS,
  JOB_TABS_ROW_CLASS,
} from "../../constants/skinCardWear/skinCardWearLayout.js"

// 탭 줄 자리만 이 창에 맞춤
export default function SkinCardWearJobTabs({ tabs, activeIndex, onSelect }) {
  return (
    <div className={JOB_TABS_ANCHOR_CLASS}>
      <InvitedGuestsJobTabs
        tabs={tabs}
        activeIndex={activeIndex}
        onSelect={onSelect}
        tabsClassName={JOB_TABS_ROW_CLASS}
      />
    </div>
  )
}
