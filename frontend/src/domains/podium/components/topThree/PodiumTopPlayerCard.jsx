import { PODIUM_ASSETS } from "../../constants/podiumAssets.js"
import {
  TOP_PLAYER_CARD_RANK1_CLASS,
  TOP_PLAYER_CARD_RANK2_CLASS,
  TOP_PLAYER_CARD_RANK3_CLASS,
  TOP_PLAYER_FRAME_CLASS,
  TOP_PLAYER_FRAME_WRAP_CLASS,
  TOP_PLAYER_NICKNAME_RANK1_CLASS,
  TOP_PLAYER_NICKNAME_RANK2_CLASS,
  TOP_PLAYER_NICKNAME_RANK3_CLASS,
  TOP_PLAYER_PHOTO_CLASS,
  TOP_PLAYER_PROFILE_SLOT_CLASS,
} from "../../constants/podiumLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

const CARD_CLASS_BY_RANK = {
  1: TOP_PLAYER_CARD_RANK1_CLASS,
  2: TOP_PLAYER_CARD_RANK2_CLASS,
  3: TOP_PLAYER_CARD_RANK3_CLASS,
}

const NICKNAME_CLASS_BY_RANK = {
  1: TOP_PLAYER_NICKNAME_RANK1_CLASS,
  2: TOP_PLAYER_NICKNAME_RANK2_CLASS,
  3: TOP_PLAYER_NICKNAME_RANK3_CLASS,
}

export default function PodiumTopPlayerCard({ rank, profileSrc, nickname }) {
  return (
    <article className={CARD_CLASS_BY_RANK[rank]}>
      <div className={TOP_PLAYER_FRAME_WRAP_CLASS}>
        <div className={TOP_PLAYER_PROFILE_SLOT_CLASS}>
          <PublicAsset src={profileSrc} alt="" className={TOP_PLAYER_PHOTO_CLASS} />
        </div>
        <PublicAsset
          src={PODIUM_ASSETS.rankFrames[rank]}
          alt=""
          className={TOP_PLAYER_FRAME_CLASS}
        />
        <p className={NICKNAME_CLASS_BY_RANK[rank]}>{nickname}</p>
      </div>
    </article>
  )
}
