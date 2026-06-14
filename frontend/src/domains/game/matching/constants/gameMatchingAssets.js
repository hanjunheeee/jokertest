/** 게임 매칭 화면 public 에셋 (frontend/public 기준) */
export const GAME_MATCHING_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png",
  popupFrame: "/frame/매칭 팝업 프레임.png",
  silhouetteReady: "/frame/매칭 준비 실루엣.png",
  silhouetteNotReady: "/frame/매칭 미준비 실루엣.png",
  startGameButton: "/button/버튼(수락 및 긍정).png",
  deleteRoomButton: "/button/버튼(취소 및 부정).png",
  restrictionMark: "/button/제한 표시.png",
  timerBar: "/frame/타이머 바.png",
  roomCodeViewButton: "/button/버튼(수락 및 긍정).png",
}

/** TODO: 서버에서 발급된 방 코드로 교체 */
export const MATCHING_ROOM_CODE_DUMMY = "123456"

export const MATCHING_POPUP_COPY = {
  title: "멀티 플레이 매칭",
  prompt: "무도회 속에 숨어든 광대를 찾아 떠나시겠습니까?",
  timerRemaining: "13초 남았습니다.",
  inputRestriction: "키보드 입력 제한",
  partyLabel: "파티 인원",
  startGame: "게임시작",
  deleteRoom: "방 삭제하기",
}

export const MATCHING_MAX_PLAYERS = 10

/** prototype 더미 — 현재 4인, 2명 준비 / 2명 미준비 (최대 10명까지 확장) */
export const MATCHING_PARTY_SLOTS_DUMMY = [
  { id: 1, ready: true },
  { id: 2, ready: true },
  { id: 3, ready: false },
  { id: 4, ready: false },
]

/** 10인 2행 그리드 확인용 더미 */
export const MATCHING_PARTY_SLOTS_DUMMY_10 = [
  { id: 1, ready: true },
  { id: 2, ready: true },
  { id: 3, ready: false },
  { id: 4, ready: false },
  { id: 5, ready: true },
  { id: 6, ready: false },
  { id: 7, ready: true },
  { id: 8, ready: false },
  { id: 9, ready: false },
  { id: 10, ready: true },
]
