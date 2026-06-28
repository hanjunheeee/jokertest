/**
 * 인게임 채팅 UI 에셋·입력 제한.
 *
 * InGameChatContent·InGameChatToggleButton·InGameChatCloseButton·pickInGameChatProfile에서 사용합니다.
 */

/** 채팅창 프레임.png 원본 크기 — 로드 전에도 inset 비율이 맞도록 aspect-ratio에 사용 */
export const INGAME_CHAT_FRAME_ASPECT = 890 / 595

/** 프레임만 축소 — 내부 UI(cqi) 크기는 유지 (ingameChatLayout inset 변환과 쌍) */
export const INGAME_CHAT_FRAME_SCALE = 0.85

/** 채팅 입력 최대 글자수 — 한 줄에 맞는 길이, 초과 입력 불가 */
export const INGAME_CHAT_MAX_MESSAGE_LENGTH = 42

/** 인게임 채팅 UI public 에셋 (frontend/public 기준) */
export const INGAME_CHAT_ASSETS = {
  frame: "/frame/chatting/채팅창 프레임.png",
  sendButton: "/button/채팅보내기 버튼.png",
  writingIndicator: "/frame/chatting/채팅작성 표시.png",
  openButton: "/button/채팅열기(기본).png",
  openButtonUnread: "/button/채팅열기(안읽음).png",
  closeButton: "/button/팝업 닫기 버튼.png",
  profileFrame: "/frame/friendList/친구 프로필 프레임.png",
  dummyProfile1: "/button/friendList/더미친구 프로필1.png",
  dummyProfile2: "/button/friendList/더미친구 프로필2.png",
  dummyProfile3: "/button/friendList/더미친구 프로필3.png",
  dummyProfile4: "/button/friendList/더미친구 프로필4.png",
  dummyProfile5: "/button/friendList/더미친구 프로필5.png",
}

/** prototype 채팅 아바타 — pickInGameChatProfile 순환·해시 선택용 */
export const INGAME_CHAT_DUMMY_PROFILES = [
  INGAME_CHAT_ASSETS.dummyProfile1,
  INGAME_CHAT_ASSETS.dummyProfile2,
  INGAME_CHAT_ASSETS.dummyProfile3,
  INGAME_CHAT_ASSETS.dummyProfile4,
  INGAME_CHAT_ASSETS.dummyProfile5,
]
