// 프로필 테두리 크게 보기 창 (닫기 버튼·테두리 그림·이름)
// StoreSheets가 씀 (데스크톱 공용 ProfileBorderZoomOverlay는 화면 파일이라 못 불러서 같은 모양으로)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { ZOOM_TRANSITION } from "@/domains/store/constants/storeSkinZoomLayout.js"
import CenterModal from "../modal/CenterModal.jsx"
import {
    BORDER_ILLUSTRATION_CLASS,
    BORDER_ILLUSTRATION_WRAP_CLASS,
    BORDER_PANEL_CLASS,
    BORDER_TITLE_CLASS,
} from "../modal/modalStyle.js"

// item = { icon, label } (데스크톱 getProfileBorderZoomItem 모양), 움직임 값은 데스크톱 확대 창과 같은 0.35초
export default function BorderZoomModal({ item, onClose }) {
    return (
        <CenterModal
            open={Boolean(item)}
            ariaLabel={item ? `${item.label} 프로필 테두리 보기` : ""}
            closeLabel="프로필 테두리 확대 보기 닫기"
            onClose={onClose}
            transition={ZOOM_TRANSITION}
            panelClassName={BORDER_PANEL_CLASS}
        >
            {item ? (
                <>
                    <div className={BORDER_ILLUSTRATION_WRAP_CLASS}>
                        <PublicAsset src={item.icon} alt={item.label} className={BORDER_ILLUSTRATION_CLASS} />
                    </div>
                    <p className={BORDER_TITLE_CLASS}>{item.label}</p>
                </>
            ) : null}
        </CenterModal>
    )
}
