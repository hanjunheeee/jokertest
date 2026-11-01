export const GAME_RESULT_ASSETS = {
  bgWin: "/bg/게임 승리 뒷배경.png".normalize("NFD"),
  bgLose: "/bg/게임 패배 뒷배경.jpeg".normalize("NFD"),
  introWin: "/bg/게임 승리 연출.mp4".normalize("NFD"),
  introLose: "/bg/게임 패배 연출.mp4".normalize("NFD"),
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
    "/shopItem/player-card/playerframe-alive/인게임-플레이어프레임(베이스).png".normalize("NFD"),
  lobbyButton: "/button/버튼(취소 및 부정).png".normalize("NFD"),
  matchingButton: "/button/버튼(수락 및 긍정).png".normalize("NFD"),
}

export function resolveGameResultIntroVideo(outcome) {
  return outcome === "lose" ? GAME_RESULT_ASSETS.introLose : GAME_RESULT_ASSETS.introWin
}

export function resolvePlayerListFrame(outcome) {
  return outcome === "lose"
    ? GAME_RESULT_ASSETS.playerListFrameLose
    : GAME_RESULT_ASSETS.playerListFrameWin
}

export function resolveMvpNameplateFrame(outcome) {
  return outcome === "lose"
    ? GAME_RESULT_ASSETS.mvpNameplateFrameLose
    : GAME_RESULT_ASSETS.mvpNameplateFrameWin
}
