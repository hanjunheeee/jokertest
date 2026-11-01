// 양피지 한 장 (위 고정 머리 칸 + 세로 스크롤 내용 + 아래 쪽 넘김 줄, 좌우로 쓸어 쪽 넘김)
// pages/LibraryPage.jsx가 씀, 안 내용은 탭 화면(forbidden·guests)이 채움
import { motion } from "framer-motion"
import {
  BOOK_DROP_ANIMATE,
  BOOK_DROP_INIT,
  BOOK_DROP_TRANSITION,
  INNER_REVEAL_ANIMATE,
  INNER_REVEAL_DELAYS,
  INNER_REVEAL_INIT,
  INNER_REVEAL_TRANSITION,
} from "@/domains/library/constants/libraryEntranceMotion.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useSwipe } from "@m/domains/library/hooks/useSwipe.js"
import { PARCHMENT_SRC } from "@m/domains/library/constants/libraryStyle.js"

// 책은 위에서 떨어지듯, 안 내용은 그 뒤에 떠오름 (데스크톱 책 등장 상수)
// 그림 가장자리 어두운 테두리는 크게 키워 잘라냄, scrollKey가 바뀌면 맨 위부터 다시 보임
export default function BookSheet({ header = null, nav = null, scrollKey, onNext, onPrev, children }) {
  const swipe = useSwipe({ onNext, onPrev })

  return (
    <div className="relative z-10 flex min-h-0 flex-1 px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:px-6 lg:mx-auto lg:w-full lg:max-w-5xl">
      <motion.div
        className="relative flex min-h-0 w-full flex-col overflow-hidden rounded-[0.6rem] border border-[#3a2414] shadow-[0_10px_30px_rgba(0,0,0,0.55),inset_0_0_24px_rgba(60,30,10,0.35)]"
        initial={BOOK_DROP_INIT}
        animate={BOOK_DROP_ANIMATE}
        transition={BOOK_DROP_TRANSITION}
        {...swipe}
      >
        <PublicAsset
          src={PARCHMENT_SRC}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-[-24%] top-[-24%] h-[148%] w-[148%] max-w-none select-none object-cover"
        />
        <motion.div
          className="relative flex min-h-0 flex-1 flex-col"
          initial={INNER_REVEAL_INIT}
          animate={INNER_REVEAL_ANIMATE}
          transition={{ ...INNER_REVEAL_TRANSITION, delay: INNER_REVEAL_DELAYS.content }}
        >
          {header ? <div className="relative shrink-0 px-2 pt-2.5">{header}</div> : null}
          <div
            key={scrollKey}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-3 md:px-6"
          >
            {children}
          </div>
          {nav}
        </motion.div>
      </motion.div>
    </div>
  )
}
