/**
 * @file modeAssets.js
 * @desc GameModePage(게임 모드 선택)·MultiplayEntryPage(멀티플레이 옵션 선택)에서
 * 쓰이는 배경·프레임 이미지 경로와 카드 목록(id·라벨·프레임)을 정의
 */

/** GameModePage·MultiplayEntryPage 공통 배경 이미지 (frontend/public 기준) */
export const MODE_SCREEN_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png",
}

/** 모드 카드에서 쓰이는 프레임 이미지 경로 모음 (GAME_MODES·MULTIPLAY_OPTIONS에서 참조) */
const MODE_FRAMES = {
  singlePlay: "/frame/gameMode/싱글플레이 프레임.png",
  multiPlay: "/frame/gameMode/멀티플레이 프레임.png",
  secretBanquet: "/frame/gameMode/비밀연회장 프레임.png",
  createGame: "/frame/gameMode/게임 만들기 프레임.png",
  findGame: "/frame/gameMode/게임 찾기 프레임.png",
}

/** prototype 게임모드 선택창2.png — 좌→우 카드 순서 */
export const GAME_MODES = [
  {
    id: "single",
    label: "싱글플레이",
    title: "싱글플레이",
    descriptionLines: [
      "홀로 무도회에 잠입하여",
      "베일 뒤에 숨은 광대를 추리하세요.",
      "(혼자서 공개방 참여하기)",
    ],
    frame: MODE_FRAMES.singlePlay,
  },
  {
    id: "multi",
    label: "멀티플레이",
    title: "멀티플레이",
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

/** prototype 게임모드 선택창-멀티플레이 선택.png — 좌→우 카드 순서 */
export const MULTIPLAY_OPTIONS = [
  {
    id: "create",
    label: "게임 만들기",
    title: "게임 만들기",
    descriptionLines: [
      "가면 아래의 진실을 숨기고",
      "새로운 이야기를 시작하세요.",
      "(방만들기)",
    ],
    frame: MODE_FRAMES.createGame,
  },
  {
    id: "find",
    label: "게임 찾기",
    title: "게임 찾기",
    descriptionLines: [
      "속임수 가득한 무도회에 숨어든",
      "변장자를 찾아내세요.",
      "(온라인 공개방 참여)",
    ],
    frame: MODE_FRAMES.findGame,
  },
]
