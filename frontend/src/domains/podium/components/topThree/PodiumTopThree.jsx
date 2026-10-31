import PodiumTopPlayerCard from "./PodiumTopPlayerCard.jsx"
import { PODIUM_TOP_THREE_WRAP_CLASS } from "../../constants/podiumLayoutStyle.js"

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
