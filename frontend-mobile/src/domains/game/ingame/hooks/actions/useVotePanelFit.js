// 투표 현황 창 크기 훅: 데스크톱 창 폭(clamp 28~42rem, 52vw)으로 그리고 폰 화면에 맞게 줄일 배율
// 투표 현황 창(VoteStatusPanel)이 씀, 열렸을 때만 화면 크기 바뀜을 들음
import { useEffect, useState } from "react"

const REM = 16
// 데스크톱 getVotePanelStyle 폭과 틀 그림 비율 (투표현황창 프레임 734x601)
const MIN_WIDTH = 28 * REM
const MAX_WIDTH = 42 * REM
const FRAME_RATIO = 601 / 734
// 화면 가장자리 여백 (양쪽 합)
const EDGE = 16

// 지금 화면 크기 → { width, scale } (창은 데스크톱 폭으로 그려서 cqi 값이 데스크톱과 같게)
function measure() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, vw * 0.52))
  const scale = Math.min(1, (vw - EDGE) / width, (vh - EDGE) / (width * FRAME_RATIO))
  return { width, scale: Math.max(0.1, scale) }
}

export function useVotePanelFit(open) {
  const [fit, setFit] = useState(measure)

  useEffect(() => {
    if (!open) return undefined
    const onResize = () => setFit(measure())
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open])

  return fit
}
