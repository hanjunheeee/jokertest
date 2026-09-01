import {
  GAME_RESULT_PLAYER_JOB_CLASS,
  GAME_RESULT_PLAYER_NAME_CLASS,
  GAME_RESULT_PLAYER_PROFILE_PHOTO_WRAP_CLASS,
  GAME_RESULT_PLAYER_PROFILE_WRAP_CLASS,
  GAME_RESULT_PLAYER_ROW_CLASS,
  GAME_RESULT_PLAYER_ROW_INNER_CLASS,
} from "../constants/gameResultLayout.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"

export default function GameResultPlayerRow({
  name,
  job,
  profilePhotoSrc,
  profileBorderSrc,
}) {
  return (
    <li className={GAME_RESULT_PLAYER_ROW_CLASS}>
      <div className={GAME_RESULT_PLAYER_ROW_INNER_CLASS}>
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={GAME_RESULT_PLAYER_PROFILE_WRAP_CLASS}
          photoWrapClassName={GAME_RESULT_PLAYER_PROFILE_PHOTO_WRAP_CLASS}
        />

        <p className={GAME_RESULT_PLAYER_NAME_CLASS}>{name}</p>
        <span className={GAME_RESULT_PLAYER_JOB_CLASS}>{job}</span>
      </div>
    </li>
  )
}
