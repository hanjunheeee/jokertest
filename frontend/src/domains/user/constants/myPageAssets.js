// 마이페이지와 계정 관리 화면에서 사용하는 public 에셋·기본값

import { MY_PAGE_BANNER_FRAME_IMAGE_CLASS } from "./myPageBannerStyle.js"

export const MY_PAGE_ASSETS = {
  bg: "/bg/마이페이지 뒷배경.png".normalize("NFD"),
  myPageButtonFrame: "/frame/mypage/마이페이지 이동 버튼 프레임(칭호삭제).png".normalize("NFD"),
  bloodRecordFrame: "/frame/mypage/피의 기록 프레임.png",
  fateMaskFrame: "/frame/mypage/운명의 가면 프레임.png",
}

/** 로비·마이페이지에서 공통으로 쓰는 프로필 배너 기본 설정 */
export const MY_PAGE_PROFILE_BANNER_DEFAULTS = {
  showText: true,
  showProfilePortrait: true,
  bannerSrc: MY_PAGE_ASSETS.myPageButtonFrame,
  bannerImageClassName: MY_PAGE_BANNER_FRAME_IMAGE_CLASS,
}

// 피의 기록 프레임의 기본값입니다.
//
// F-30 AC-01: 예전에는 prototype 더미 세 행(전체 판수 1,245 · 생존 횟수 788 · 단두대 처형 112)이
// 들어 있었다. 그 기본값은 stats를 받지 못한 화면에 **실제 전적처럼 보이는 가짜 숫자**를 그리고,
// 조회가 실패한 경우조차 그럴듯한 기록으로 위장한다(AC-03). 비어 있는 것이 정답이다 —
// 실제 두 행은 useMyProfile이 서버 응답에서 만들어 내려보낸다.
export const BLOOD_RECORD_STATS = []

// 운명의 가면 하단 설명 문구입니다.
export const FATE_MASK_DESCRIPTION = {
  prefix: "이 자는",
  highlight: "광대",
  suffix: "의 가면을 쓸 때 가장 잔혹합니다.",
}
