import {
  FATE_MASK_DESC_CLASS,
  FATE_MASK_DESC_INSET,
  FATE_MASK_HIGHLIGHT_CLASS,
  FATE_MASK_TEXT_SHADOW,
} from "../../constants/myPageLayoutStyle.js"

export default function FateMaskDescription({ description }) {
  const { prefix, highlight, suffix } = description

  return (
    <p
      className={FATE_MASK_DESC_CLASS}
      style={{ ...FATE_MASK_DESC_INSET, textShadow: FATE_MASK_TEXT_SHADOW }}
    >
      <span className="whitespace-nowrap">
        {prefix ? `${prefix} ` : null}
        <span className={FATE_MASK_HIGHLIGHT_CLASS}>[{highlight}]</span>
        {suffix}
      </span>
    </p>
  )
}
