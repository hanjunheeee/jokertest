/** 게임 결과 화면 public 에셋 (frontend/public 기준) */
export const GAME_RESULT_ASSETS = {
  bgWin: "/bg/게임 승리 뒷배경.png",
  bgLose: "/bg/게임 패배 뒷배경.jpeg",
  bannerFrame: "/frame/gameResult/게임 결과 프레임.png",
  playerListFrameWin:
    "/frame/gameResult/결과창 플레이어 목록 프레임(승리).png",
  playerListFrameLose:
    "/frame/gameResult/결과창 플레이어 목록 프레임(패배).png",
  mvpNameplateFrameWin:
    "/frame/gameResult/MVP 플레이어 명찰 프레임(승리).png",
  mvpNameplateFrameLose:
    "/frame/gameResult/MVP 플레이어 명찰 프레임(패배).png",
  mvpPlayerFrame:
    "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(베이스).png",
  profileFrame: "/frame/friendList/친구 프로필 프레임.png",
}

/** @param {"win" | "lose"} outcome */
export function resolveGameResultPlayerListFrame(outcome) {
  return outcome === "lose"
    ? GAME_RESULT_ASSETS.playerListFrameLose
    : GAME_RESULT_ASSETS.playerListFrameWin
}

/** @param {"win" | "lose"} outcome */
export function resolveGameResultMvpNameplateFrame(outcome) {
  return outcome === "lose"
    ? GAME_RESULT_ASSETS.mvpNameplateFrameLose
    : GAME_RESULT_ASSETS.mvpNameplateFrameWin
}
