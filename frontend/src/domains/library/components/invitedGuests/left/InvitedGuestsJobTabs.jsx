import { INVITED_GUESTS_ASSETS } from "../../../../../domains/library/constants/invitedGuests/assets.js"
import {
  JOB_TAB_BG_IMG_CLASS,
  JOB_TAB_BTN_CLASS,
  JOB_TAB_LABEL_ACTIVE_CLASS,
  JOB_TAB_LABEL_CLASS,
  JOB_TAB_LABEL_INACTIVE_CLASS,
  JOB_TABS_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"

function InvitedGuestsJobTabButton({ label, active, onClick }) {
  const buttonImage = active ? INVITED_GUESTS_ASSETS.jobTabActive : INVITED_GUESTS_ASSETS.jobTabInactive
  const labelColorClass = active
    ? JOB_TAB_LABEL_ACTIVE_CLASS
    : JOB_TAB_LABEL_INACTIVE_CLASS

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={JOB_TAB_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={buttonImage} alt="" className={JOB_TAB_BG_IMG_CLASS} />
      <span className={`${JOB_TAB_LABEL_CLASS} ${labelColorClass}`}>{label}</span>
    </button>
  )
}

export default function InvitedGuestsJobTabs({
  tabs,
  activeIndex,
  onSelect,
  tabsClassName = JOB_TABS_CLASS,
}) {
  return (
    <div className={tabsClassName} role="tablist" aria-label="직업 선택">
      {tabs.map(({ id, jobLabel }, index) => (
        <InvitedGuestsJobTabButton
          key={id}
          label={jobLabel}
          active={index === activeIndex}
          onClick={() => onSelect(index)}
        />
      ))}
    </div>
  )
}