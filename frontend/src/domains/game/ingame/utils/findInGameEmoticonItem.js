import { getStoreItemById } from "../../../store/constants/storeItems.js"

/** 이모티콘만 골라낸다 — 다른 카테고리의 id가 섞여 들어와도 아이콘을 그리지 않는다. */
const EMOTICON_CATEGORY = "이모티콘"

/**
 * E-3(F-33 AC-03/AC-04): itemId를 상점 카탈로그의 이모티콘 항목으로 바꾼다.
 *
 * EmoticonPalettePage.jsx의 emoticonItemOf와 **같은 판정**을 인게임 팔레트·말풍선이 공유한다
 * (마이페이지 화면 모듈을 인게임이 import하면 그 그래프가 라우터·API까지 끌고 온다). 등록되지
 * 않은 id·다른 카테고리의 id에는 null을 돌려주므로, 호출부가 item.icon에 손대다 예외를 내거나
 * 서버가 보낸 원시 문자열이 화면에 새지 않는다.
 *
 * @param {unknown} itemId
 * @returns {{id:string,name:string,icon:string}|null}
 */
export function findInGameEmoticonItem(itemId) {
  if (typeof itemId !== "string" || itemId.length === 0) return null
  const item = getStoreItemById(itemId)
  if (!item || item.category !== EMOTICON_CATEGORY) return null
  return item
}
