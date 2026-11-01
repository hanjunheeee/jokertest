// 투표 창 틀 그림 창: 틀·제목·닫기 + 스크롤 본문 (가운데 겹 창)
// 대기방 추방·친구 초대 창과 인게임 추방 창이 씀, 데스크톱 추방·친구 초대 창(투표 창 틀 빌림)과 같은 틀·덮개
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import Modal from "./Modal.jsx"
import { CLOSE_STYLE, FRAME_ASSETS, FRAME_STYLE, TITLE_CLASS, TITLE_STYLE } from "./voteFrameStyle.js"

// 제목은 틀 위쪽 판 자리, 닫기는 오른쪽 위 (둘 다 틀 테두리 안에 겹침)
export default function VoteFrameModal({ open, onClose, title, closeLabel, testId, children }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={closeLabel}
      ariaLabel={title}
      testId={testId}
      className="flex max-h-full flex-col text-white"
      style={FRAME_STYLE}
    >
      <h2 className={TITLE_CLASS} style={TITLE_STYLE}>{title}</h2>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        data-sfx-kind="ui-cancel"
        className="absolute right-0 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-95"
        style={CLOSE_STYLE}
      >
        <PublicAsset src={FRAME_ASSETS.closeButton} alt="" className="block h-10 w-10 select-none object-contain" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-[5%] pb-2">
        {children}
      </div>
    </Modal>
  )
}
