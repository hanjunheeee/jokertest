import { STORE_ASSETS } from "./storeAssets.js"

const DUMMY_ICONS = [
  STORE_ASSETS.dummyItem1,
  STORE_ASSETS.dummyItem2,
  STORE_ASSETS.dummyItem3,
  STORE_ASSETS.dummyItem4,
]

const DUMMY_GRID_TEXT = [
  { name: "스킨", tagline: "황혼의 그림자 · 한정" },
  { name: "가면", tagline: "붉은 자수 문양이 빛나는" },
  { name: "잔혹한 단죄", tagline: "짧고 강렬한 처형 연출" },
  { name: "궁전의 수호자", tagline: "닉네임 옆에 표시되는 칭호" },
]

export const STORE_GRID_ITEMS = Array.from({ length: 8 }, (_, index) => ({
  id: `store-item-${index}`,
  icon: DUMMY_ICONS[index % DUMMY_ICONS.length],
  name: DUMMY_GRID_TEXT[index % DUMMY_GRID_TEXT.length].name,
  tagline: DUMMY_GRID_TEXT[index % DUMMY_GRID_TEXT.length].tagline,
}))

const DUMMY_ITEM_INFO = [
  {
    name: "황혼의 조커",
    grade: "레어",
    category: "스킨",
    description:
      "어스름한 카페 테이블 위에서 카드를 섞는 조커. 황혼빛이 카드 테두리를 따라 흐르며, 승리 시 짧은 연출이 재생됩니다.",
    priceAmount: "1,200",
    tag: "한정",
  },
  {
    name: "피 묻은 가면",
    grade: "에픽",
    category: "가면",
    description:
      "대기실 프로필에 착용되는 가면. 붉은 자수 문양이 은은하게 빛나며, 친구 목록에서도 동일하게 표시됩니다.",
    priceAmount: "2,400",
    tag: "신규",
  },
  {
    name: "침묵의 처형",
    grade: "레어",
    category: "처형",
    description:
      "라운드 종료 시 상대를 처형할 때 재생되는 연출. 짧고 날카로운 효과음과 함께 카드가 바닥에 떨어집니다.",
    priceAmount: "980",
    tag: null,
  },
  {
    name: "운명을 거스르는 자",
    grade: "일반",
    category: "칭호",
    description:
      "마이페이지와 대기실 닉네임 옆에 표시되는 칭호. 시즌 랭크 10위 이내 달성 시 획득할 수 있습니다.",
    priceAmount: "600",
    tag: "시즌",
  },
]

export function getStoreDummyItemInfo(itemId) {
  const index = Number.parseInt(String(itemId).replace("store-item-", ""), 10)
  const safeIndex = Number.isFinite(index) ? index : 0
  return DUMMY_ITEM_INFO[safeIndex % DUMMY_ITEM_INFO.length]
}
