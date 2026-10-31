import { MY_PAGE_BANNER_FRAME_IMAGE_CLASS } from "./myPageBannerStyle.js"

export const MY_PAGE_ASSETS = {
  bg: "/bg/마이페이지 뒷배경.png".normalize("NFD"),
  myPageButtonFrame: "/frame/mypage/마이페이지 이동 버튼 프레임(칭호삭제).png".normalize("NFD"),
  bloodRecordFrame: "/frame/mypage/피의 기록 프레임.png",
  fateMaskFrame: "/frame/mypage/운명의 가면 프레임.png",
}

export const MY_PAGE_PROFILE_BANNER_DEFAULTS = {
  showText: true,
  showProfilePortrait: true,
  bannerSrc: MY_PAGE_ASSETS.myPageButtonFrame,
  bannerImageClassName: MY_PAGE_BANNER_FRAME_IMAGE_CLASS,
}

export const BLOOD_RECORD_STATS = []

export const FATE_MASK_DESCRIPTION = {
  prefix: "이 자는",
  highlight: "광대",
  suffix: "의 가면을 쓸 때 가장 잔혹합니다.",
}
