// 운명의 가면 아래 설명 한 줄 (강조 낱말은 대괄호로 묶어 보임)
// FateMaskFooter가 씀
import {
  FATE_MASK_DESC_CLASS,
  FATE_MASK_DESC_INSET,
  FATE_MASK_HIGHLIGHT_CLASS,
  FATE_MASK_TEXT_SHADOW,
} from "../constants/myPageLayoutStyle.js"

// 앞말은 있을 때만 띄어 붙임
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
