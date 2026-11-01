// 이모티콘 아이템 찾기: 상점 아이템 중 이모티콘 종류만
// 이모티콘 말풍선·이모티콘 팔레트가 사용
import { getStoreItemById } from "../../../store/constants/storeItems.js"

// 상점 아이템 중 이모티콘을 가르는 종류 이름
const EMOTICON_CATEGORY = "이모티콘"

// id로 이모티콘 아이템 (빈 id·없는 id·다른 종류면 null)
export function findInGameEmoticonItem(itemId) {
  if (typeof itemId !== "string" || itemId.length === 0) return null
  const item = getStoreItemById(itemId)
  if (!item || item.category !== EMOTICON_CATEGORY) return null
  return item
}
