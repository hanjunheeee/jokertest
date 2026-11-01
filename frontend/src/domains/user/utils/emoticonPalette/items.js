// 이모티콘 팔레트 화면의 이모티콘 찾기·목록 거르기
// 이모티콘 팔레트 화면 훅이 씀 (바퀴 칸 그림은 emoticonItemOf로 찾음)
import { EMOTICON_STORE_ITEMS, getStoreItemById } from "@/domains/store/constants/storeItems.js"
import { EMOTICON_CATEGORY } from "../../constants/emoticonPaletteText.js"

// 칸에 든 id가 이모티콘 상품일 때만 상품 정보를 줌
export const emoticonItemOf = (itemId) => {
  if (typeof itemId !== "string" || itemId.length === 0) return null
  const item = getStoreItemById(itemId)
  if (!item || item.category !== EMOTICON_CATEGORY) return null
  return item
}

// 등급(전체면 안 거름)과 이름에 든 검색어로 거름
export const filterEmoticons = (gradeFilter, query) => {
  const keyword = query.trim()
  return EMOTICON_STORE_ITEMS.filter((item) => {
    if (gradeFilter !== "전체" && item.grade !== gradeFilter) return false
    if (keyword.length > 0 && !item.name.includes(keyword)) return false
    return true
  })
}
