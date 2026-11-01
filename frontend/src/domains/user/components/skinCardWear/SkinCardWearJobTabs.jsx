import InvitedGuestsJobTabs from "../../../library/components/invitedGuests/left/InvitedGuestsJobTabs.jsx"
import {
  JOB_TABS_ANCHOR_CLASS,
  JOB_TABS_ROW_CLASS,
} from "../../constants/skinCardWear/skinCardWearLayout.js"

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
