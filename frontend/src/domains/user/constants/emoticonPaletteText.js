// 이모티콘 팔레트 화면 상수 (이모티콘 분류 이름·등급 거르기 항목·저장 실패 문구)
// 이모티콘 팔레트 화면 훅·보유 칸·찾기 계산, 인게임 이모티콘 찾기(findInGameEmoticonItem)가 씀

// 상점 상품 중 이모티콘 분류 이름, 등급 거르기 항목 ('전체'는 안 거름)
export const EMOTICON_CATEGORY = "이모티콘"
export const GRADE_FILTERS = ["전체", "기본", "상점"]

// 서버 실패 코드별 문구, 없는 코드는 기본 문구를 씀
export const SAVE_FAILURE_MESSAGES = {
  INVALID_SLOTS: "팔레트 구성이 올바르지 않습니다. 같은 이모티콘을 두 칸에 넣을 수 없습니다.",
  NOT_OWNED: "보유하지 않은 이모티콘이 포함되어 있습니다. 목록을 다시 불러온 뒤 시도해 주세요.",
  NOT_READY: "팔레트를 아직 불러오지 못했습니다.",
}
