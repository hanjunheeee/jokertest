// 초대받은 자들 앞면 (직업 이름·직업 설명·서 있는 그림·나의 직업 전적)
// guests/InvitedGuestsView.jsx가 씀
import { JOB_TITLE_CLASS } from "@m/domains/library/constants/guestsStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import MyStats from "@m/domains/library/components/guests/MyStats.jsx"
import { SECTION_TITLE_CLASS, SMALL_TEXT_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 빈 줄 기준으로 문단 나눔, 빈 문단 버림 (데스크톱 직업 설명과 같음)
function splitParagraphs(description = "") {
  return description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

// 그림은 설명 오른쪽에 띄워 글이 둘러 흐름 (폰 폭에서 두 칸 나누면 글 칸이 너무 좁음)
export default function JobIntroPage({ content, onRetry }) {
  const paragraphs = splitParagraphs(content.description)

  return (
    <div className="flex flex-col gap-4">
      <h2 className={`m-0 ${JOB_TITLE_CLASS}`}>직업 [{content.jobName}]</h2>
      <section className="flow-root">
        <h3 className={`m-0 mb-1.5 ${SECTION_TITLE_CLASS}`}>직업 설명</h3>
        <PublicAsset
          src={content.standingImage}
          alt=""
          className="float-right mb-1 ml-2 block h-auto max-h-48 w-[34%] max-w-36 select-none object-contain object-bottom"
        />
        {paragraphs.map((paragraph, index) => (
          <p key={index} className={`m-0 mb-2.5 font-medium leading-[1.65] ${SMALL_TEXT_CLASS}`}>
            {paragraph}
          </p>
        ))}
      </section>
      <MyStats content={content} onRetry={onRetry} />
    </div>
  )
}
