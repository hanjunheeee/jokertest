import {
  STAT_CHIP_CLASS,
  STAT_NUMBER_CLASS,
  STAT_PERCENT_SUFFIX_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/tableStyle.js"

function renderStatContent(value) {
  const text = String(value)
  const isPercent = text.endsWith("%")
  const number = isPercent ? text.slice(0, -1) : text

  if (isPercent) {
    return (
      <>
        <span className={STAT_NUMBER_CLASS}>{number}</span>
        <span className={STAT_PERCENT_SUFFIX_CLASS}>%</span>
      </>
    )
  }

  return <span className={STAT_NUMBER_CLASS}>{number}</span>
}

export default function InvitedGuestsStatValue({ value, chip = false }) {
  const content = renderStatContent(value)

  if (chip) {
    return <span className={STAT_CHIP_CLASS}>{content}</span>
  }

  return content
}