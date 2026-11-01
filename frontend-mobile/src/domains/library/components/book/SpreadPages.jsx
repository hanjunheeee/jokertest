// 펼침면 두 쪽 놓기 (한 쪽씩이면 고른 면만, 두 쪽 모양이면 가운데 접힌 선 두고 나란히)
// forbidden·guests 탭 화면이 씀
import { motion } from "framer-motion"

const PAGE_ENTER = { initial: { opacity: 0, x: 14 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }

// pageKey가 바뀌면 넘긴 쪽이 살짝 밀려 들어옴, stickyRight면 긴 왼쪽을 내려도 오른쪽 그림이 따라옴
export default function SpreadPages({ left, right, side, twoColumn, pageKey, stickyRight = false }) {
  if (twoColumn) {
    return (
      <motion.div key={pageKey} {...PAGE_ENTER} className="grid min-h-full grid-cols-2 gap-0">
        <div className="min-w-0 border-r border-[#2a1810]/20 pr-4">{left}</div>
        <div className={`min-w-0 pl-4 ${stickyRight ? "sticky top-0 self-start" : ""}`}>{right}</div>
      </motion.div>
    )
  }

  return (
    <motion.div key={`${pageKey}-${side}`} {...PAGE_ENTER} className="min-h-full">
      {side === 0 ? left : right}
    </motion.div>
  )
}
