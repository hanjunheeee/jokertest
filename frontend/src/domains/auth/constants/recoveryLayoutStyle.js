// 아이디 찾기·비밀번호 재설정 화면 공통 class (알림 상자, 액자 뒤로 가기 버튼 자리)
// pages/FindIdPage.jsx·passwordReset 폴더, recovery 폼 3개, AuthFrameBackButton.jsx가 사용

// 알림 상자 (에러·결과 안내 둘 다 이 모양)
export const RECOVERY_ALERT_CLASS =
  "rounded border border-red-800/35 bg-red-100/90 px-3 py-2 text-sm text-red-900"

// 액자 왼쪽 아래 뒤로 가기 버튼 자리·폭
export const FRAME_BACK_BTN_CLASS =
  "absolute bottom-2.5 left-0 z-10 !w-[clamp(2.85rem,4.8vw,3.35rem)] shrink-0"
