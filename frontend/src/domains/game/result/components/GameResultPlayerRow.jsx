import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import {
  GAME_RESULT_PLAYER_JOB_CLASS,
  GAME_RESULT_PLAYER_NAME_CLASS,
  GAME_RESULT_PLAYER_PROFILE_FRAME_CLASS,
  GAME_RESULT_PLAYER_PROFILE_WRAP_CLASS,
  GAME_RESULT_PLAYER_ROW_CLASS,
  GAME_RESULT_PLAYER_ROW_INNER_CLASS,
} from "../constants/gameResultLayout.js"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function GameResultPlayerRow({ name, job, portraitSrc }) {
  return (
    <li className={GAME_RESULT_PLAYER_ROW_CLASS}>
      <div className={GAME_RESULT_PLAYER_ROW_INNER_CLASS}>
        <div className={GAME_RESULT_PLAYER_PROFILE_WRAP_CLASS}>
          <PlayerPortraitFrame variant="recordList" src={portraitSrc} />
          <PublicAsset
            src={GAME_RESULT_ASSETS.profileFrame}
            alt=""
            className={GAME_RESULT_PLAYER_PROFILE_FRAME_CLASS}
          />
        </div>

        <p className={GAME_RESULT_PLAYER_NAME_CLASS}>{name}</p>
        <span className={GAME_RESULT_PLAYER_JOB_CLASS}>{job}</span>
      </div>
    </li>
  )
}