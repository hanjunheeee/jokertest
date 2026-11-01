// 마이페이지 그림 경로와 배너·피의 기록·운명의 가면 기본값
// 마이페이지·배너·피의 기록·운명의 가면·사용자 화면 배경·시험이 씀
import { BANNER_FRAME_IMG_CLASS } from "./myPageBannerStyle.js"

// 배경·배너 틀·피의 기록 틀·운명의 가면 틀 그림
export const MY_PAGE_ASSETS = {
  bg: "/bg/마이페이지 뒷배경.png".normalize("NFD"),
  myPageButtonFrame: "/frame/mypage/마이페이지 이동 버튼 프레임(칭호삭제).png".normalize("NFD"),
  bloodRecordFrame: "/frame/mypage/피의 기록 프레임.png",
  fateMaskFrame: "/frame/mypage/운명의 가면 프레임.png",
}

// 마이페이지 배너 설정 (버튼 기본값과 같고 초상만 켬)
export const MY_PAGE_PROFILE_BANNER_DEFAULTS = {
  showText: true,
  showProfilePortrait: true,
  bannerSrc: MY_PAGE_ASSETS.myPageButtonFrame,
  bannerImageClassName: BANNER_FRAME_IMG_CLASS,
}

// 피의 기록 줄 기본값 (빈 목록, 실제로는 프로필 전적을 넘김)
export const BLOOD_RECORD_STATS = []

// 운명의 가면 설명 기본값 (실제로는 프로필 설명을 넘김)
export const FATE_MASK_DESCRIPTION = {
  prefix: "이 자는",
  highlight: "광대",
  suffix: "의 가면을 쓸 때 가장 잔혹합니다.",
}
