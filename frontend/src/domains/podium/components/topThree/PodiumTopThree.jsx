import PodiumTopPlayerCard from "@/domains/podium/components/topThree/PodiumTopPlayerCard.jsx"
import { PODIUM_TOP_THREE_WRAP_CLASS } from "@/domains/podium/constants/podiumLayoutStyle.js"

/** 1~3위 포디움 — 2위(좌) · 1위(중앙) · 3위(우) */
export default function PodiumTopThree({ entries }) {
  const byRank = Object.fromEntries(entries.map((entry) => [entry.rank, entry]))

  return (
    <section className={PODIUM_TOP_THREE_WRAP_CLASS} aria-label="상위 3위">
      <PodiumTopPlayerCard {...byRank[2]} />
      <PodiumTopPlayerCard {...byRank[1]} />
      <PodiumTopPlayerCard {...byRank[3]} />
    </section>
  )
}
