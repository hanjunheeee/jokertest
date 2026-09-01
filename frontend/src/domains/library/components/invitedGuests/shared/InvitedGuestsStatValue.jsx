import {
  INVITED_GUESTS_STAT_CHIP_CLASS,
  INVITED_GUESTS_STAT_NUMBER_CLASS,
  INVITED_GUESTS_STAT_PERCENT_SUFFIX_CLASS,
} from "@/domains/library/constants/invitedGuests/tableStyle.js"

function renderStatContent(value) {
  const text = String(value)
  const isPercent = text.endsWith("%")
  const number = isPercent ? text.slice(0, -1) : text

  if (isPercent) {
    return (
      <>
        <span className={INVITED_GUESTS_STAT_NUMBER_CLASS}>{number}</span>
        <span className={INVITED_GUESTS_STAT_PERCENT_SUFFIX_CLASS}>%</span>
      </>
    )
  }

  return <span className={INVITED_GUESTS_STAT_NUMBER_CLASS}>{number}</span>
}

/** 초대받은 자들 — 전적·랭킹 수치 (칩 옵션, 승률 % 분리) */
export default function InvitedGuestsStatValue({ value, chip = false }) {
  const content = renderStatContent(value)

  if (chip) {
    return <span className={INVITED_GUESTS_STAT_CHIP_CLASS}>{content}</span>
  }

  return content
}
