// 대기방 그림 경로·팝업 문구·미리보기용 가짜 자리
// 대기방 컴포넌트·RoomCodeViewModal·useMatchingPage·chunkPlayerSlots가 씀
export const GAME_MATCHING_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png".normalize("NFD"),
  popupFrame: "/frame/매칭 팝업 프레임.png",
  silhouetteReady: "/frame/매칭 준비 실루엣.png",
  silhouetteNotReady: "/frame/매칭 미준비 실루엣.png",
  startGameButton: "/button/버튼(수락 및 긍정).png".normalize("NFD"),
  deleteRoomButton: "/button/버튼(취소 및 부정).png".normalize("NFD"),
  roomCodeViewButton: "/button/버튼(수락 및 긍정).png".normalize("NFD"),
  roomCodeShareFrame: "/frame/방코드 발송 프레임.png",
}

// 방 코드 가짜 값 (지금 부르는 곳 없음)
export const ROOM_CODE_DUMMY = "123456"

// 대기방 팝업 문구
export const MATCHING_POPUP_COPY = {
  title: "멀티 플레이 매칭",
  prompt: "무도회 속에 숨어든 광대를 찾아 떠나시겠습니까?",
  awaitingHostRoom: "방장이 새 방을 만드는 중입니다. 잠시만 기다려 주세요.",
  partyLabel: "파티 인원",
  startGame: "게임시작",
  deleteRoom: "방 삭제하기",
  leaveRoom: "방 나가기",
  readyOn: "준비완료",
  readyOff: "준비취소",
  readyPending: "처리 중",
  readyBadge: "준비완료",
  notReadyBadge: "대기중",
  startingGame: "시작 중",
  changeRoomSettings: "방 설정 변경",
  kickParticipant: "참가자 추방",
}

// 최대 인원 (지금 부르는 곳 없음)
export const MATCHING_MAX_PLAYERS = 10

// 가짜 자리 4칸 (지금 부르는 곳 없음)
export const PARTY_SLOTS_DUMMY = [
  { id: 1, ready: true },
  { id: 2, ready: true },
  { id: 3, ready: false },
  { id: 4, ready: false },
]

// 가짜 자리 10칸 (방에 없을 때 미리보기, chunkPlayerSlots가 씀)
export const PARTY_SLOTS_DUMMY_10 = [
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
