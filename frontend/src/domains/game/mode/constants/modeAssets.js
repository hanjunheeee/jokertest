// 게임 모드 선택 계열 화면의 공통 배경 에셋입니다.
export const MODE_SCREEN_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png".normalize("NFD"),
}

// 각 모드 카드에 사용할 프레임 이미지입니다.
const MODE_FRAMES = {
  singlePlay: "/frame/gameMode/싱글플레이 프레임.png",
  multiPlay: "/frame/gameMode/멀티플레이 프레임.png",
  secretBanquet: "/frame/gameMode/비밀연회장 프레임.png",
  createGame: "/frame/gameMode/게임 만들기 프레임.png",
  findGame: "/frame/gameMode/게임 찾기 프레임.png",
}

// 게임 모드 선택 화면에 보여줄 카드 데이터입니다.
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
