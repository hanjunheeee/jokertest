// PNG 파일명 → 갤러리 캡션 (build-screenshot-gallery.mjs가 import)
export const SCREENSHOT_LABELS = {
  "01-auth-login.png": "로그인 /login",
  "02-auth-signup.png": "회원가입 /login (가입 모드)",
  "03-auth-find-id.png": "아이디 찾기 /find-id",
  "04-auth-pw-request.png": "비밀번호 찾기(요청) /password-reset/request",
  "05-lobby-main.png": "로비",
  "06-lobby-notifications.png": "로비 · 알림",
  "07-lobby-friends.png": "로비 · 친구",
  "08-mypage-main.png": "마이페이지",
  "09-mypage-profile-edit.png": "프로필 수정 시트",
  "10-mypage-wear.png": "스킨&카드 착용",
  "11-emoticon-page.png": "이모티콘",
  "12-account-main.png": "계정 관리",
  "13-setting-general.png": "설정 · 일반",
  "14-store-main.png": "상점",
  "15-library-forbidden.png": "서고 · 금지된 기록",
  "16-library-guests.png": "서고 · 초대받은 자들",
  "17-gamemode-main.png": "모드 선택",
  "18-multiplay-main.png": "멀티 플레이",
  "19-room-invite-main.png": "비밀연회장 초대",
}

export function labelForScreenshotFile(file) {
  return (
    SCREENSHOT_LABELS[file] ??
    file
      .replace(/\.png$/i, "")
      .replace(/^\d+-/, "")
      .replace(/-/g, " ")
  )
}
