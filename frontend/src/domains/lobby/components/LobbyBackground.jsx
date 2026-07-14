// 파일 역할: LobbyBackground.jsx - 화면을 구성하는 컴포넌트입니다.
import { LOBBY_ASSETS } from "@/domains/lobby/constants/lobbyAssets.js"
import {
  LOBBY_BG_VIDEO_CLASS,
  LOBBY_INTRO_SKIP_LAYER_CLASS,
} from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import { BGM_ASSETS } from "@/shared/constants/bgmAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 로비 배경음악, 배경 영상, 인트로 스킵 영역을 담당합니다.
export default function LobbyBackground({ bgVideoRef, audioRef, uiVisible, onSkipIntro }) {
  return (
    <>
      <audio ref={audioRef} src={publicAsset(BGM_ASSETS.loginMusic)} loop />
      <video
        ref={bgVideoRef}
        src={publicAsset(LOBBY_ASSETS.bgVideo)}
        autoPlay
        muted
        playsInline
        preload="auto"
        className={LOBBY_BG_VIDEO_CLASS}
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
