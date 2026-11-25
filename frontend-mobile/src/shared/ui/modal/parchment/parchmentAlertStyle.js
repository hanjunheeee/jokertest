// 인증·전역 양피지 alert 문구 모양 (인게임 안내 창 톤)
// 양피지 알림·확인 창(ParchmentAlertHost·ParchmentConfirmHost)과 재설정·디스코드 연결 창이 씀
export const PARCHMENT_ALERT_MSG_CLASS =
  "px-1 font-subheading app-text-scaled [--app-text-size:13px] font-semibold leading-relaxed text-[#3a1a0c]/90 break-keep"

// 전역 알림·확인 창 겹 순서: 어디서 떠도 맨 위 (사망 창 68·추방 70·광고 120·점검 130보다 위)
// 원래 판 시작 불가 창 값(z-40·41)이라 인게임 겹 창 밑에 깔려 못 누름
const PARCHMENT_HOST_Z = Object.freeze({ "z-40": "z-[140]", "z-[41]": "z-[141]" })
export const toParchmentHostLayer = (className) =>
  className.replace(/^absolute /, "fixed ").replace(/(^|\s)(z-40|z-\[41\])(?=\s|$)/, (_, lead, z) => `${lead}${PARCHMENT_HOST_Z[z]}`)

// 확인·취소 두 줄(방 삭제 등): 가로 넘침 없이 줄바꿈
export const PARCHMENT_CONFIRM_MSG_CLASS =
  "w-full min-w-0 max-w-full whitespace-pre-line px-1 font-subheading app-text-scaled [--app-text-size:13px] font-semibold leading-relaxed text-[#3a1a0c]/90 break-words"
