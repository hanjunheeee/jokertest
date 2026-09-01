import { motion } from "framer-motion"
import { getForbiddenRecordsPage } from "@/domains/library/content/forbiddenRecords/index.js"
import {
  FORBIDDEN_STORY_BODY_TRANSITION,
  FORBIDDEN_STORY_PARAGRAPH_STAGGER,
  FORBIDDEN_STORY_REVEAL_ANIMATE,
  FORBIDDEN_STORY_REVEAL_INITIAL,
  FORBIDDEN_STORY_TITLE_TRANSITION,
} from "@/domains/library/constants/forbiddenRecords/entranceMotion.js"
import {
  LIBRARY_FORBIDDEN_LEFT_PAGE_CLASS,
  LIBRARY_FORBIDDEN_SECTION_BODY_CLASS,
  LIBRARY_FORBIDDEN_SECTION_BODY_WRAP_CLASS,
  LIBRARY_FORBIDDEN_SECTION_TITLE_CLASS,
} from "@/domains/library/constants/forbiddenRecords/layoutStyle.js"

function splitBodyParagraphs(body) {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

/** 금지된 기록 — 좌측 반페이지 */
export default function ForbiddenRecordsLeftPage({ pageIndex = 0 }) {
  const { left } = getForbiddenRecordsPage(pageIndex)
  const paragraphs = splitBodyParagraphs(left.body)

  return (
    <div className={LIBRARY_FORBIDDEN_LEFT_PAGE_CLASS}>
      <section key={pageIndex}>
        <motion.h2
          className={LIBRARY_FORBIDDEN_SECTION_TITLE_CLASS}
          initial={FORBIDDEN_STORY_REVEAL_INITIAL}
          animate={FORBIDDEN_STORY_REVEAL_ANIMATE}
          transition={FORBIDDEN_STORY_TITLE_TRANSITION}
        >
          {left.title}
        </motion.h2>
        <div className={LIBRARY_FORBIDDEN_SECTION_BODY_WRAP_CLASS}>
          {paragraphs.map((paragraph, index) => (
            <motion.p
              key={`${pageIndex}-${index}`}
              className={LIBRARY_FORBIDDEN_SECTION_BODY_CLASS}
              initial={FORBIDDEN_STORY_REVEAL_INITIAL}
              animate={FORBIDDEN_STORY_REVEAL_ANIMATE}
              transition={{
                ...FORBIDDEN_STORY_BODY_TRANSITION,
                delay:
                  FORBIDDEN_STORY_BODY_TRANSITION.delay +
                  index * FORBIDDEN_STORY_PARAGRAPH_STAGGER,
              }}
            >
              {paragraph}
            </motion.p>
          ))}
        </div>
      </section>
    </div>
  )
}
