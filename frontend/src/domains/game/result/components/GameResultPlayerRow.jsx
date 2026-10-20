import { GAME_RESULT_SELF_INFO_BADGE_LABEL } from "../constants/gameResultLabels.js"
import {
  GAME_RESULT_PLAYER_INFO_CLASS,
  GAME_RESULT_PLAYER_JOB_CLASS,
  GAME_RESULT_PLAYER_JOB_SELF_CLASS,
  GAME_RESULT_PLAYER_NAME_CLASS,
  GAME_RESULT_PLAYER_NAME_SELF_CLASS,
  GAME_RESULT_PLAYER_PROFILE_PHOTO_WRAP_CLASS,
  GAME_RESULT_PLAYER_PROFILE_WRAP_CLASS,
  GAME_RESULT_PLAYER_ROW_CLASS,
  GAME_RESULT_PLAYER_ROW_INNER_CLASS,
  GAME_RESULT_PLAYER_ROW_INNER_SELF_CLASS,
  GAME_RESULT_PLAYER_SELF_BADGE_CLASS,
} from "../constants/gameResultLayout.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"

export default function GameResultPlayerRow({
  name,
  job,
  profilePhotoSrc,
  profileBorderSrc,
  isSelf = false,
}) {
  return (
    <li className={GAME_RESULT_PLAYER_ROW_CLASS}>
      <div
        className={`${GAME_RESULT_PLAYER_ROW_INNER_CLASS}${isSelf ? ` ${GAME_RESULT_PLAYER_ROW_INNER_SELF_CLASS}` : ""}`}
      >
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={GAME_RESULT_PLAYER_PROFILE_WRAP_CLASS}
          photoWrapClassName={GAME_RESULT_PLAYER_PROFILE_PHOTO_WRAP_CLASS}
        />

        <div className={GAME_RESULT_PLAYER_INFO_CLASS}>
          {isSelf ? (
            <span className={GAME_RESULT_PLAYER_SELF_BADGE_CLASS}>
              {GAME_RESULT_SELF_INFO_BADGE_LABEL}
            </span>
          ) : null}
          <p
            className={`${GAME_RESULT_PLAYER_NAME_CLASS}${isSelf ? ` ${GAME_RESULT_PLAYER_NAME_SELF_CLASS}` : ""}`}
          >
            {name}
          </p>
        </div>
        <span
          className={`${GAME_RESULT_PLAYER_JOB_CLASS}${isSelf ? ` ${GAME_RESULT_PLAYER_JOB_SELF_CLASS}` : ""}`}
        >
          {job}
        </span>
      </div>
    </li>
  )
}
