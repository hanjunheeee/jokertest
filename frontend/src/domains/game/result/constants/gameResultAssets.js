/** 게임 결과 화면 public 에셋 (frontend/public 기준) */
export const GAME_RESULT_ASSETS = {
  bgWin: "/bg/게임 승리 뒷배경.png".normalize("NFD"),
  bgLose: "/bg/게임 패배 뒷배경.jpeg".normalize("NFD"),
  bannerFrame: "/frame/gameResult/게임 결과 프레임.png".normalize("NFD"),
  playerListFrameWin:
    "/frame/gameResult/결과창 플레이어 목록 프레임(승리).png".normalize("NFD"),
  playerListFrameLose:
    "/frame/gameResult/결과창 플레이어 목록 프레임(패배).png".normalize("NFD"),
  mvpNameplateFrameWin:
    "/frame/gameResult/MVP 플레이어 명찰 프레임(승리).png".normalize("NFD"),
  mvpNameplateFrameLose:
    "/frame/gameResult/MVP 플레이어 명찰 프레임(패배).png".normalize("NFD"),
  mvpPlayerFrame:
    "/frame/ingame-playercard/playerframe-alive/인게임-플레이어프레임(베이스).png",
  profileFrame: "/frame/friendList/친구 프로필 프레임.png".normalize("NFD"),
  /** 로비 복귀 버튼 — 방 삭제/초대 취소와 같은 "부정·이탈" 계열 빨간 버튼 에셋 */
  lobbyButton: "/button/버튼(취소 및 부정).png".normalize("NFD"),
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