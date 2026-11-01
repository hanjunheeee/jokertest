import { motion } from "framer-motion"
import { getForbiddenRecordsPage } from "../../content/forbiddenRecords/pages.js"
import {
  STORY_BODY_TRANSITION,
  STORY_PARAGRAPH_STAGGER,
  STORY_REVEAL_ANIMATE,
  STORY_REVEAL_INIT,
  STORY_TITLE_TRANSITION,
} from "../../../../domains/library/constants/forbiddenRecords/entranceMotion.js"
import {
  LEFT_PAGE_CLASS,
  SECTION_BODY_CLASS,
  SECTION_BODY_WRAP_CLASS,
  SECTION_TITLE_CLASS,
} from "../../../../domains/library/constants/forbiddenRecords/layoutStyle.js"

function splitBodyParagraphs(body) {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export default function ForbiddenRecordsLeftPage({ pageIndex = 0 }) {
  const { left } = getForbiddenRecordsPage(pageIndex)
  const paragraphs = splitBodyParagraphs(left.body)

  return (
    <div className={LEFT_PAGE_CLASS}>
      <section key={pageIndex}>
        <motion.h2
          className={SECTION_TITLE_CLASS}
          initial={STORY_REVEAL_INIT}
          animate={STORY_REVEAL_ANIMATE}
          transition={STORY_TITLE_TRANSITION}
        >
          {left.title}
        </motion.h2>
        <div className={SECTION_BODY_WRAP_CLASS}>
          {paragraphs.map((paragraph, index) => (
            <motion.p
              key={`${pageIndex}-${index}`}
              className={SECTION_BODY_CLASS}
              initial={STORY_REVEAL_INIT}
              animate={STORY_REVEAL_ANIMATE}
              transition={{
                ...STORY_BODY_TRANSITION,
                delay:
                  STORY_BODY_TRANSITION.delay +
                  index * STORY_PARAGRAPH_STAGGER,
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