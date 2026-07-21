// 마이페이지와 계정 관리 화면에서 사용하는 public 에셋입니다.
export const MY_PAGE_ASSETS = {
  bg: "/bg/마이페이지 뒷배경.png".normalize("NFD"),
  reputationBanner: "/button/마이페이지 이동 버튼_프로토타입.png".normalize("NFD"),
  profileFrame: "/frame/mypage/마이페이지 프로필 프레임.png".normalize("NFD"),
  profilePhoto: "/frame/mypage/마이페이지 프로필 사진.png".normalize("NFD"),
  bloodRecordFrame: "/frame/mypage/피의 기록 프레임.png",
  fateMaskFrame: "/frame/mypage/운명의 가면 프레임.png",
}

// 피의 기록 프레임에 보여줄 prototype 더미 통계입니다.
export const BLOOD_RECORD_STATS = [
  { label: "전체 판수", value: "1,245" },
  { label: "생존 횟수", value: "788" },
  { label: "단두대 처형", value: "112" },
]

// 운명의 가면 하단 설명 문구입니다.
export const FATE_MASK_DESCRIPTION = {
  prefix: "이 자는",
  highlight: "광대",
  suffix: "의 가면을 쓸 때 가장 잔혹합니다.",
}
