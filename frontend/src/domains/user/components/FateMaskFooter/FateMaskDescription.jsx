import {
  FATE_MASK_DESCRIPTION_CLASS,
  FATE_MASK_DESCRIPTION_INSET,
  FATE_MASK_HIGHLIGHT_CLASS,
  FATE_MASK_TEXT_SHADOW,
} from "@/domains/user/constants/myPageLayoutStyle.js"

export default function FateMaskDescription({ description }) {
  // prefix: 강조 단어 앞 문장입니다.
  // highlight: 노란색으로 강조할 역할 이름입니다.
  // suffix: 강조 단어 뒤 문장입니다.
  const { prefix, highlight, suffix } = description

  return (
    <p
      className={FATE_MASK_DESCRIPTION_CLASS}
      style={{ ...FATE_MASK_DESCRIPTION_INSET, textShadow: FATE_MASK_TEXT_SHADOW }}
    >
      <span>
        {prefix}{" "}
        <span className={FATE_MASK_HIGHLIGHT_CLASS}>[{highlight}]</span>
        {suffix}
      </span>
    </p>
  )
}
