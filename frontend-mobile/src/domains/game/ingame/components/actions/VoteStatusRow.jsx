// 투표 현황 한 줄: 이름 칸 + 값 칸 (줄 높이 44px)
// 투표 현황 내용(VoteStatusContent)이 씀
export default function VoteStatusRow({ term, value, testId }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[#d8b982]/15 last:border-b-0">
      <dt className="font-subheading text-[#e0c9a3]">{term}</dt>
      <dd className="min-w-0 truncate font-semibold text-[#f8ead2]" data-testid={testId}>{value}</dd>
    </div>
  )
}
