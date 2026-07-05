/**
 * 게임 모드 프레임 공통 텍스트 오버레이
 * ModeOptionCard 및 동일 프레임을 쓰는 다른 UI에서 재사용
 */
import {
  MODE_CARD_DESCRIPTION_CLASS,
  MODE_CARD_DESCRIPTION_INSET,
  MODE_CARD_TITLE_CLASS,
  MODE_CARD_TITLE_INSET,
} from "../constants/modeCardLayout.js"

/** title·descriptionLines를 프레임 위 고정 슬롯에 렌더 */
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
        <p
          className={MODE_CARD_DESCRIPTION_CLASS}
          style={MODE_CARD_DESCRIPTION_INSET}
        >
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
