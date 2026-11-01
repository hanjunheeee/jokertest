// 친구 시트 머리 (지금 탭 이름 + 닫기 버튼)
// FriendsSheet가 맨 위에 그림, 폰 가로에선 높이를 아끼려고 숨김 (제목은 대화상자 이름으로 계속 쓰임)
import CloseButton from "./parts/CloseButton.jsx"

// 제목은 시트 대화상자 이름과 같은 글자 (데스크톱 getAriaLabel)
export default function SheetHeader({ title, titleId, onClose }) {
  return (
    <header className="flex shrink-0 items-center gap-2 pb-1 land:hidden">
      <h2 id={titleId} className="min-w-0 flex-1 truncate pl-1 font-display app-text-scaled [--app-text-size:22px] text-[#ebe2cc] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {title}
      </h2>
      <CloseButton onClick={onClose} />
    </header>
  )
}
