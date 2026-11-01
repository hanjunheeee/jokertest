// 두 쪽을 나란히 펼칠 화면인지 (폰 가로·태블릿 이상)
// pages/LibraryPage.jsx가 씀, 쪽 넘김 단위와 펼침 모양을 정함
import { useSyncExternalStore } from "react"

// index.css의 land:(가로·높이 540 이하)와 md:(768 이상)에 맞춤
const TWO_COLUMN_QUERY = "(min-width: 768px), (orientation: landscape) and (max-height: 540px) and (min-width: 560px)"

// 화면을 돌리거나 크기가 바뀌면 다시 그림
function subscribe(onChange) {
  const media = window.matchMedia(TWO_COLUMN_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

// 지금 화면이 두 쪽 모양인지
function getSnapshot() {
  return window.matchMedia(TWO_COLUMN_QUERY).matches
}

export function useTwoColumn() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
