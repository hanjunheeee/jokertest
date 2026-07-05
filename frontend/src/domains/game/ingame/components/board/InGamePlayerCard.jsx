import {
  INGAME_PLAYER_ASSETS,
  INGAME_PLAYER_CARD_SHADOW_CLASS,
  INGAME_PLAYER_NAMEPLATE_CLASS,
  INGAME_PLAYER_NAMEPLATE_INSET,
} from "../../constants/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../constants/ingamePlayerStatus.js"
import InGamePlayerStatusOverlay from "./status/InGamePlayerStatusOverlay.jsx"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

/**
 * 인게임 플레이어 카드 — 배경 + 직업 초상 + 상태 UI + 프레임 + 닉네임
 */
export default function InGamePlayerCard({
  // portraitSrc: 카드에 그릴 직업 전신 이미지 경로. 없으면 배경만 표시하고 초상은 생략
  portraitSrc,
  nickname = "",
  status = INGAME_PLAYER_STATUS.ALIVE,
  // className: 부모(InGamePlayerBoard)가 카드 크기(큰 카드/작은 카드)를 지정할 때 넘기는 클래스
  className = "",
}) {
  return (
    <div
      className={`relative shrink-0 [container-type:inline-size] ${INGAME_PLAYER_CARD_SHADOW_CLASS} ${className}`}
    >
      <div className="relative w-full overflow-hidden">
        <PlayerPortraitFrame variant="ingameCard" src={portraitSrc} />
        <InGamePlayerStatusOverlay status={status} />

        <PublicAsset
          src={INGAME_PLAYER_ASSETS.cardFrame}
          alt=""
          className="relative z-10 block h-auto w-full select-none"
        />

        {nickname ? (
          <p
            className={INGAME_PLAYER_NAMEPLATE_CLASS}
            style={INGAME_PLAYER_NAMEPLATE_INSET}
          >
            <span className="block w-full truncate">{nickname}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
