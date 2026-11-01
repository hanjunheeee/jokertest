import { SELF_INFO_BADGE_LABEL } from "../constants/gameResultLabels.js"
import {
  PLAYER_INFO_CLASS,
  PLAYER_JOB_CLASS,
  PLAYER_JOB_SELF_CLASS,
  PLAYER_NAME_CLASS,
  PLAYER_NAME_SELF_CLASS,
  PLAYER_PROFILE_PHOTO_WRAP_CLASS,
  PLAYER_PROFILE_WRAP_CLASS,
  PLAYER_ROW_CLASS,
  PLAYER_ROW_INNER_CLASS,
  PLAYER_ROW_INNER_SELF_CLASS,
  PLAYER_SELF_BADGE_CLASS,
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
    <li className={PLAYER_ROW_CLASS}>
      <div
        className={`${PLAYER_ROW_INNER_CLASS}${isSelf ? ` ${PLAYER_ROW_INNER_SELF_CLASS}` : ""}`}
      >
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={PLAYER_PROFILE_WRAP_CLASS}
          photoWrapClassName={PLAYER_PROFILE_PHOTO_WRAP_CLASS}
        />

        <div className={PLAYER_INFO_CLASS}>
          {isSelf ? (
            <span className={PLAYER_SELF_BADGE_CLASS}>
              {SELF_INFO_BADGE_LABEL}
            </span>
          ) : null}
          <p
            className={`${PLAYER_NAME_CLASS}${isSelf ? ` ${PLAYER_NAME_SELF_CLASS}` : ""}`}
          >
            {name}
          </p>
        </div>
        <span
          className={`${PLAYER_JOB_CLASS}${isSelf ? ` ${PLAYER_JOB_SELF_CLASS}` : ""}`}
        >
          {job}
        </span>
      </div>
    </li>
  )
}
