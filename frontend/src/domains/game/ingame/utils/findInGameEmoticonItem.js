import { getStoreItemById } from "../../../store/constants/storeItems.js"

const EMOTICON_CATEGORY = "이모티콘"

export function findInGameEmoticonItem(itemId) {
  if (typeof itemId !== "string" || itemId.length === 0) return null
  const item = getStoreItemById(itemId)
  if (!item || item.category !== EMOTICON_CATEGORY) return null
  return item
}
