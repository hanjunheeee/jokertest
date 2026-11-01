// 프로필 테두리 크게 보기 창 (닫기 버튼·테두리 그림·이름)
// 상점(StoreSheets)·서고(ChallengeList)가 씀, 데스크톱 공용 ProfileBorderZoomOverlay(화면 파일이라 못 부름)와 같은 모양·움직임
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import CenterModal from "./CenterModal.jsx"
import { ILLUSTRATION_CLASS, ILLUSTRATION_WRAP_CLASS, PANEL_CLASS, TITLE_CLASS, ZOOM_TRANSITION } from "./borderZoomStyle.js"

// item = { icon, label } (데스크톱 getProfileBorderZoomItem 모양), 비면 닫힘
export default function BorderZoomModal({ item, onClose }) {
  return (
    <CenterModal
      open={Boolean(item)}
      ariaLabel={item ? `${item.label} 프로필 테두리 보기` : ""}
      closeLabel="프로필 테두리 확대 보기 닫기"
      onClose={onClose}
      transition={ZOOM_TRANSITION}
      panelClassName={PANEL_CLASS}
    >
      {item ? (
        <>
          <div className={ILLUSTRATION_WRAP_CLASS}>
            <PublicAsset src={item.icon} alt={item.label} className={ILLUSTRATION_CLASS} />
          </div>
          <p className={TITLE_CLASS}>{item.label}</p>
        </>
      ) : null}
    </CenterModal>
  )
}
