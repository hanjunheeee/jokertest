// 친구 시트 머리 (지금 탭 이름 + 닫기 버튼)
// FriendsSheet가 맨 위에 그림, 폰 가로에선 높이를 아끼려고 숨김 (제목은 대화상자 이름으로 계속 쓰임)
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import { CLOSE_BTN_CLASS, CLOSE_BUTTON_SRC, CLOSE_ICON_CLASS } from "./sheetStyle.js"

// 제목은 시트 대화상자 이름과 같은 글자 (데스크톱 getAriaLabel)
export default function SheetHeader({ title, titleId, onClose }) {
  return (
    <header className="flex shrink-0 items-center gap-2 pb-1 land:hidden">
      <h2 id={titleId} className="min-w-0 flex-1 truncate pl-1 font-display app-text-scaled [--app-text-size:22px] text-[#ebe2cc] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {title}
      </h2>
      <CloseButton
        label="친구 목록 닫기"
        onClick={onClose}
        src={CLOSE_BUTTON_SRC}
        className={`${CLOSE_BTN_CLASS} grid`}
        iconClassName={CLOSE_ICON_CLASS}
      />
    </header>
  )
}
