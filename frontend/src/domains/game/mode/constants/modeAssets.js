// 모드 선택 화면 배경·카드 목록 (id·이름·설명·틀 그림·준비중)
// GameModeOptionsArea·ModeBackground가 씀, id는 GameModePage가 갈 곳 가를 때 씀
export const MODE_SCREEN_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png".normalize("NFD"),
}

// 카드 틀 그림 (createGame·findGame은 지금 안 씀)
const MODE_FRAMES = {
  singlePlay: "/frame/gameMode/싱글플레이 프레임.png",
  multiPlay: "/frame/gameMode/멀티플레이 프레임.png",
  secretBanquet: "/frame/gameMode/비밀연회장 프레임.png",
  createGame: "/frame/gameMode/게임 만들기 프레임.png",
  findGame: "/frame/gameMode/게임 찾기 프레임.png",
}

// 모드 카드 목록 (single은 준비중이라 눌리지 않음)
export const GAME_MODES = [
  {
    id: "single",
    label: "랜덤 매칭",
    title: "랜덤 매칭",
    comingSoon: true,
    descriptionLines: [
      "홀로 무도회에 잠입하여",
      "베일 뒤에 숨은 광대를 추리하세요.",
      "(혼자서 공개방 참여하기)",
    ],
    frame: MODE_FRAMES.singlePlay,
  },
  {
    id: "multi",
    label: "방 찾기",
    title: "방 찾기",
    descriptionLines: [
      "다른 귀족들과 교류하며,",
      "무도회장을 피로 물들이려는",
      "광대를 처단하세요.",
      "(방 만들기 및 팀원과 함께하기)",
    ],
    frame: MODE_FRAMES.multiPlay,
  },
  {
    id: "secret-banquet",
    label: "비밀연회장",
    title: "비밀연회장",
    descriptionLines: [
      "규칙과 인원을 직접 설계하여,",
      "당신만을 위한 은밀한",
      "연회를 개최하세요.",
      "(방 참여하기)",
    ],
    frame: MODE_FRAMES.secretBanquet,
  },
]
