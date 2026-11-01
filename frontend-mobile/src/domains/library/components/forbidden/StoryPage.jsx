// 금지된 기록 앞면 (원고 제목·본문 문단)
// forbidden/ForbiddenRecordsView.jsx가 씀
import { motion } from "framer-motion"
import {
  STORY_BODY_TRANSITION,
  STORY_PARAGRAPH_STAGGER,
  STORY_REVEAL_ANIMATE,
  STORY_REVEAL_INIT,
  STORY_TITLE_TRANSITION,
} from "@/domains/library/constants/forbiddenRecords/entranceMotion.js"
import { BODY_TEXT_CLASS, PAGE_TITLE_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 빈 줄 기준으로 문단 나눔, 빈 문단 버림 (데스크톱 왼쪽 쪽과 같음)
function splitParagraphs(body) {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

// 제목 먼저, 문단은 하나씩 늦게 떠오름 (데스크톱 움직임 값 그대로)
export default function StoryPage({ title, body }) {
  const paragraphs = splitParagraphs(body)

  return (
    <section>
      <motion.h2
        className={`m-0 ${PAGE_TITLE_CLASS}`}
        initial={STORY_REVEAL_INIT}
        animate={STORY_REVEAL_ANIMATE}
        transition={STORY_TITLE_TRANSITION}
      >
        {title}
      </motion.h2>
      <div className="mt-2 flex flex-col gap-3">
        {paragraphs.map((paragraph, index) => (
          <motion.p
            key={index}
            className={`m-0 ${BODY_TEXT_CLASS}`}
            initial={STORY_REVEAL_INIT}
            animate={STORY_REVEAL_ANIMATE}
            transition={{
              ...STORY_BODY_TRANSITION,
              delay: STORY_BODY_TRANSITION.delay + index * STORY_PARAGRAPH_STAGGER,
            }}
          >
            {paragraph}
          </motion.p>
        ))}
      </div>
    </section>
  )
}
