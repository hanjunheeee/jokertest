// 파일 역할: ModeOptionCardOverlay.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  MODE_CARD_DESCRIPTION_CLASS,
  MODE_CARD_DESCRIPTION_INSET,
  MODE_CARD_TITLE_CLASS,
  MODE_CARD_TITLE_INSET,
} from "@/domains/game/mode/constants/modeCardLayout.js"

// 게임 모드 카드 이미지 위에 제목과 설명을 올려 보여줍니다.
export default function ModeOptionCardOverlay({ title, descriptionLines }) {
  if (!title && !descriptionLines?.length) return null

  return (
    <>
      {title ? (
        <span className={MODE_CARD_TITLE_CLASS} style={MODE_CARD_TITLE_INSET}>
          {title}
        </span>
      ) : null}

      {descriptionLines?.length ? (
        <p className={MODE_CARD_DESCRIPTION_CLASS} style={MODE_CARD_DESCRIPTION_INSET}>
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
