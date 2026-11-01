// 모드 카드 위 글자: 제목·설명 줄
// ModeOptionCard가 씀
import {
  DESC_CLASS,
  DESC_INSET,
  MODE_CARD_TITLE_CLASS,
  MODE_CARD_TITLE_INSET,
} from "@/domains/game/mode/constants/modeCardLayout.js"

// 카드 글자 (제목·설명 둘 다 없으면 안 그림)
export default function ModeOptionCardOverlay({ title, descriptionLines }) {
  if (!title && !descriptionLines?.length) return null

  return (
    <>
      {/* 제목 있을 때만 */}
      {title ? (
        <span className={MODE_CARD_TITLE_CLASS} style={MODE_CARD_TITLE_INSET}>
          {title}
        </span>
      ) : null}

      {/* 설명 줄은 줄바꿈 넣어 이어 붙임 */}
      {descriptionLines?.length ? (
        <p className={DESC_CLASS} style={DESC_INSET}>
          {descriptionLines.map((line, index) => (
            <span key={`${index}-${line}`}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      ) : null}
    </>
  )
}
