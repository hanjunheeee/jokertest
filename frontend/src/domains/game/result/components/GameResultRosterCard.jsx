import InGamePlayerCard from "@/domains/game/ingame/components/board/InGamePlayerCard.jsx"
import {
  GAME_RESULT_ROSTER_CARD_CLASS,
  GAME_RESULT_ROSTER_CARD_WRAP_CLASS,
  GAME_RESULT_ROSTER_INFO_CLASS,
  GAME_RESULT_ROSTER_JOB_CLASS,
  GAME_RESULT_ROSTER_JOB_LABEL_CLASS,
  GAME_RESULT_ROSTER_NAME_CLASS,
} from "../constants/gameResultLayout.js"

export default function GameResultRosterCard({
  name,
  job,
  portraitSrc,
  frameSrc,
  cardStatus,
  showJobLabel = false,
}) {
  return (
    <li className={GAME_RESULT_ROSTER_CARD_WRAP_CLASS}>
      {showJobLabel ? (
        <span className={GAME_RESULT_ROSTER_JOB_LABEL_CLASS}>내 직업:</span>
      ) : null}
      <InGamePlayerCard
        className={GAME_RESULT_ROSTER_CARD_CLASS}
        portraitSrc={portraitSrc}
        frameSrc={frameSrc}
        nickname={name}
        status={cardStatus}
      />
      {name || job ? (
        <div className={GAME_RESULT_ROSTER_INFO_CLASS}>
          {name ? <p className={GAME_RESULT_ROSTER_NAME_CLASS}>{name}</p> : null}
          {job ? <span className={GAME_RESULT_ROSTER_JOB_CLASS}>{job}</span> : null}
        </div>
      ) : null}
    </li>
  )
}
