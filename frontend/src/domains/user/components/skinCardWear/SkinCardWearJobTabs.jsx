import InvitedGuestsJobTabs from "../../../library/components/invitedGuests/left/InvitedGuestsJobTabs.jsx"
import {
  SKIN_CARD_WEAR_JOB_TABS_ANCHOR_CLASS,
  SKIN_CARD_WEAR_JOB_TABS_ROW_CLASS,
} from "../../constants/skinCardWear/skinCardWearLayout.js"

export default function SkinCardWearJobTabs({ tabs, activeIndex, onSelect }) {
  return (
    <div className={SKIN_CARD_WEAR_JOB_TABS_ANCHOR_CLASS}>
      <InvitedGuestsJobTabs
        tabs={tabs}
        activeIndex={activeIndex}
        onSelect={onSelect}
        tabsClassName={SKIN_CARD_WEAR_JOB_TABS_ROW_CLASS}
      />
    </div>
  )
}
