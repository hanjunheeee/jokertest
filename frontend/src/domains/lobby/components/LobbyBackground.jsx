import { LOBBY_ASSETS } from "@/domains/lobby/constants/lobbyAssets.js"
import {
  LOBBY_BG_IMAGE_CLASS,
  LOBBY_BG_VIDEO_CLASS,
  LOBBY_BG_VIDEO_HIDDEN_CLASS,
  LOBBY_INTRO_SKIP_LAYER_CLASS,
} from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { publicAsset } from "@/shared/utils/publicAsset.js"

/** 로비 배경 PNG + 인트로 영상 */
export default function LobbyBackground({ bgVideoRef, uiVisible, onSkipIntro }) {
  return (
    <>
      <PublicAsset
        src={LOBBY_ASSETS.bgImage}
        alt=""
        className={LOBBY_BG_IMAGE_CLASS}
        aria-hidden="true"
      />
      <video
        ref={bgVideoRef}
        src={publicAsset(LOBBY_ASSETS.bgVideo)}
        autoPlay
        muted
        playsInline
        preload="auto"
        className={`${LOBBY_BG_VIDEO_CLASS} ${uiVisible ? LOBBY_BG_VIDEO_HIDDEN_CLASS : ""}`}
      />
      {!uiVisible ? (
        <button
          type="button"
          aria-label="인트로 건너뛰기"
          onClick={onSkipIntro}
          className={LOBBY_INTRO_SKIP_LAYER_CLASS}
        />
      ) : null}
    </>
  )
}
