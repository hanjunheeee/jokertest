/**
 * 마이페이지 화면에서 쓰는 이미지 경로 · 텍스트 상수 모음.
 *
 * 컴포넌트 로직과 분리해 여기서만 관리하면, 문구나 이미지 경로를 바꿀 때
 * 컴포넌트 코드를 건드리지 않아도 됩니다.
 */

/** 마이페이지 public 에셋 경로 (frontend/public 기준) */
export const MY_PAGE_ASSETS = {
  bg: "/bg/마이페이지 뒷배경.png",
  reputationBanner: "/button/마이페이지 이동 버튼_프로토타입.png",
  profileFrame: "/frame/mypage/마이페이지 프로필 프레임.png",
  profilePhoto: "/frame/mypage/마이페이지 프로필 사진.png",
  bloodRecordFrame: "/frame/mypage/피의 기록 프레임.png",
  fateMaskFrame: "/frame/mypage/운명의 가면 프레임.png",
}

/** 마이페이지 명성 배너 텍스트 */
export const MY_PAGE_PROFILE = {
  reputationLabel: "플레이어 모던",
  reputationValue: 92,
  title: "고결한 귀족",
}

/** prototype 피의 기록 — 라벨(좌) / 수치(우) */
export const BLOOD_RECORD_STATS = [
  { label: "전체 판수", value: "1,245" },
  { label: "생존 횟수", value: "788" },
  { label: "단두대 처형", value: "112" },
]

/** prototype 운명의 가면 설명 ([광대] 강조) */
export const FATE_MASK_DESCRIPTION = {
  prefix: "이 자는",
  highlight: "광대",
  suffix: "의 가면을 쓸 때 가장 잔혹합니다.",
}
