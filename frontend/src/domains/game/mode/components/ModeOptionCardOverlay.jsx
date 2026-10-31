import {
  MODE_CARD_DESCRIPTION_CLASS,
  MODE_CARD_DESCRIPTION_INSET,
  MODE_CARD_TITLE_CLASS,
  MODE_CARD_TITLE_INSET,
} from "@/domains/game/mode/constants/modeCardLayout.js"

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
