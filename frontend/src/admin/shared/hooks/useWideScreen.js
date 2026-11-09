// 화면이 넓은지(768px 이상) 알려 주는 훅 파일, 폭이 바뀌면 바로 다시 그림
// DataList(표 ↔ 카드)·AdminLayout(왼쪽 메뉴 ↔ 서랍)이 씀
import { useSyncExternalStore } from 'react'

const WIDE_QUERY = '(min-width: 768px)'

// matchMedia 없는 곳(오래된 브라우저)은 넓은 화면으로 봄
const mediaOf = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE_QUERY) : null)

const subscribe = (onChange) => {
  const media = mediaOf()
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

const isWideNow = () => mediaOf()?.matches ?? true

export const useWideScreen = () => useSyncExternalStore(subscribe, isWideNow, () => true)
