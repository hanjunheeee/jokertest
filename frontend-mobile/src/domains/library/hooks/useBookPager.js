// 쪽 넘김 (한 쪽씩 볼 땐 앞면 → 뒷면 → 다음 기록, 두 쪽 함께 볼 땐 기록 단위)
// pages/LibraryPage.jsx가 씀, 바닥 넘김 줄·쓸어 넘기기가 같은 함수를 부름

// location은 useLibraryLocation 반환값, twoColumn은 두 쪽 함께 보임 여부
// mergedSpread: 한 스크롤에 해금·본문을 함께 (금지된 기록 폰 세로) → 면 넘김 없이 기록만 넘김
export function useBookPager(location, twoColumn, { mergedSpread = false } = {}) {
  const { side, setSide, canGoNext, canGoPrev, goNext, goPrev } = location

  const canNext = mergedSpread || twoColumn ? canGoNext : side === 0 || canGoNext
  const canPrev = mergedSpread || twoColumn ? canGoPrev : side === 1 || canGoPrev

  const next = () => {
    if (!canNext) return
    if (!mergedSpread && !twoColumn && side === 0) {
      setSide(1)
      return
    }
    goNext()
    setSide(0)
  }

  const prev = () => {
    if (!canPrev) return
    if (!mergedSpread && !twoColumn && side === 1) {
      setSide(0)
      return
    }
    goPrev()
    setSide(mergedSpread || twoColumn ? 0 : 1)
  }

  return { canNext, canPrev, next, prev }
}
