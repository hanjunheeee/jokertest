// 쪽 넘김 (한 쪽씩 볼 땐 앞면 → 뒷면 → 다음 기록, 두 쪽 함께 볼 땐 기록 단위)
// pages/LibraryPage.jsx가 씀, 바닥 넘김 줄·쓸어 넘기기가 같은 함수를 부름

// location은 useLibraryLocation 반환값, twoColumn은 두 쪽 함께 보임 여부
export function useBookPager(location, twoColumn) {
  const { side, setSide, canGoNext, canGoPrev, goNext, goPrev } = location

  const canNext = twoColumn ? canGoNext : side === 0 || canGoNext
  const canPrev = twoColumn ? canGoPrev : side === 1 || canGoPrev

  // 앞면이면 뒷면으로, 뒷면이면 다음 기록 앞면으로
  const next = () => {
    if (!canNext) return
    if (!twoColumn && side === 0) {
      setSide(1)
      return
    }
    goNext()
    setSide(0)
  }

  // 뒷면이면 앞면으로, 앞면이면 이전 기록 뒷면으로
  const prev = () => {
    if (!canPrev) return
    if (!twoColumn && side === 1) {
      setSide(0)
      return
    }
    goPrev()
    setSide(twoColumn ? 0 : 1)
  }

  return { canNext, canPrev, next, prev }
}
