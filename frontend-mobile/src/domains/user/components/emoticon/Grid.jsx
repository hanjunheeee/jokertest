// 이모티콘 판 목록 (폰 3열·넓으면 더, 기본 스크롤)
// EmoticonPalettePage가 씀
import Plate from "@m/domains/user/components/emoticon/Plate.jsx"
import { GRID_GAP_CLASS, GRID_ITEM_CLASS } from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

const LIST_CLASS = `m-0 grid list-none grid-cols-3 content-start p-[0.15rem] md:grid-cols-5 land:grid-cols-4 ${GRID_GAP_CLASS}`

// 데스크톱처럼 3열·같은 간격, 자체 스크롤바 대신 터치 기본 스크롤, 거른 결과가 없으면 빈 목록
export default function Grid({ items, ownedIds, disabled, onAssign }) {
  return (
    <ul aria-label="이모티콘 목록" className={LIST_CLASS}>
      {items.map((item) => (
        <li key={item.id} className={`min-w-0 ${GRID_ITEM_CLASS}`}>
          <Plate item={item} owned={ownedIds.has(item.id)} disabled={disabled} onAssign={onAssign} />
        </li>
      ))}
    </ul>
  )
}
