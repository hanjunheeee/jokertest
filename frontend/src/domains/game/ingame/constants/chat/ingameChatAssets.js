/**
 * 인게임 채팅 UI 에셋·입력 제한.
 *
 * InGameChatContent에서 사용합니다.
 */

/** 인게임-채팅창프레임.png 원본 크기 (851×638) — inset 비율·aspect-ratio 기준 */
export const INGAME_CHAT_FRAME_ASPECT = 851 / 638

/** 누끼 PNG — 프레임 1:1 표시 (scale 보정 불필요) */
export const INGAME_CHAT_FRAME_SCALE = 1

/** 채팅 입력·전송 최대 글자수 (멀티라인 안전망) */
export const INGAME_CHAT_INPUT_MAX_LENGTH = 150

/** @deprecated INGAME_CHAT_INPUT_MAX_LENGTH 사용 */
export const INGAME_CHAT_MAX_MESSAGE_LENGTH = INGAME_CHAT_INPUT_MAX_LENGTH

/** 인게임 채팅 UI public 에셋 (frontend/public 기준) */
export const INGAME_CHAT_ASSETS = {
  frame: "/frame/ingame-chatting/인게임-채팅창프레임.png",
  sendButton: "/button/채팅보내기 버튼.png",
}
