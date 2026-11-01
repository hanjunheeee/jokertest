// 이모티콘 판 목록 (폰 4열·태블릿 6열, 기본 스크롤)
// EmoticonPalettePage가 씀
import Plate from "@m/domains/user/components/emoticon/Plate.jsx"

// 데스크톱 자체 스크롤바 대신 터치 기본 스크롤, 거른 결과가 없으면 안내 글
export default function Grid({ items, ownedIds, disabled, onAssign }) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center font-subheading text-sm text-[#f5f0e6]/75">
        조건에 맞는 이모티콘이 없습니다.
      </p>
    )
  }

  return (
    <ul aria-label="이모티콘 목록" className="m-0 grid list-none grid-cols-4 gap-2 p-0 md:grid-cols-6 land:grid-cols-4">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <Plate item={item} owned={ownedIds.has(item.id)} disabled={disabled} onAssign={onAssign} />
        </li>
      ))}
    </ul>
  )
}
