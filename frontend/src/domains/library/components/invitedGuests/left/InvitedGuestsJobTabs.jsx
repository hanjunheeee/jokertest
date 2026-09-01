import { INVITED_GUESTS_ASSETS } from "@/domains/library/constants/invitedGuests/assets.js"
import {
  INVITED_GUESTS_JOB_TAB_BG_IMAGE_CLASS,
  INVITED_GUESTS_JOB_TAB_BUTTON_CLASS,
  INVITED_GUESTS_JOB_TAB_LABEL_ACTIVE_CLASS,
  INVITED_GUESTS_JOB_TAB_LABEL_CLASS,
  INVITED_GUESTS_JOB_TAB_LABEL_INACTIVE_CLASS,
  INVITED_GUESTS_JOB_TABS_CLASS,
} from "@/domains/library/constants/invitedGuests/layoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

function InvitedGuestsJobTabButton({ label, active, onClick }) {
  const buttonImage = active ? INVITED_GUESTS_ASSETS.jobTabActive : INVITED_GUESTS_ASSETS.jobTabInactive
  const labelColorClass = active
    ? INVITED_GUESTS_JOB_TAB_LABEL_ACTIVE_CLASS
    : INVITED_GUESTS_JOB_TAB_LABEL_INACTIVE_CLASS

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={INVITED_GUESTS_JOB_TAB_BUTTON_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={buttonImage} alt="" className={INVITED_GUESTS_JOB_TAB_BG_IMAGE_CLASS} />
      <span className={`${INVITED_GUESTS_JOB_TAB_LABEL_CLASS} ${labelColorClass}`}>{label}</span>
    </button>
  )
}

/** 초대받은 자들 — 좌측 상단 직업 서브탭 */
export default function InvitedGuestsJobTabs({ tabs, activeIndex, onSelect }) {
  return (
    <div className={INVITED_GUESTS_JOB_TABS_CLASS} role="tablist" aria-label="직업 선택">
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
