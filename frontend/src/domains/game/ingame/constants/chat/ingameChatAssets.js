// 판 채팅 창 그림·틀 비율·입력 글자 수 한도
// 채팅 화면들과 채팅 모양 상수가 사용

// 틀 그림 가로세로 비율과 틀 크기 배율 (1이면 그대로)
export const FRAME_ASPECT = 861 / 636

export const INGAME_CHAT_FRAME_SCALE = 1

// 명패·타이머가 틀 그림에 포함된 리메이크 패널 (board·closeup)
export const INGAME_CHAT_USE_UNIFIED_PANEL = true

// 한 번에 보낼 수 있는 글자 수
export const INPUT_MAX_LENGTH = 150

// 채팅 틀·보내기·닫기 버튼 그림
export const INGAME_CHAT_ASSETS = {
  frame: "/frame/ingame-chatting/채팅패널_리메이크.png",
  sendButton: "/frame/ingame-chatting/채팅보내기버튼_리메이크.png",
  closeButton: "/button/팝업 닫기 버튼.webp",
}
