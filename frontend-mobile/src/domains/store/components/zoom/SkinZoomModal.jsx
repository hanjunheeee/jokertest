// 스킨 전신 보기 창 (닫기 버튼·아래 붙여 세운 전신 그림)
// StoreSheets가 씀 (데스크톱 StoreSkinZoomOverlay 자리)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { getSkinZoomIcon } from "@/domains/store/constants/storeItems.js"
import {
    ILLUSTRATION_CLASS,
    ILLUSTRATION_WRAP_CLASS,
    ZOOM_TRANSITION,
} from "@/domains/store/constants/storeSkinZoomLayout.js"
import CenterModal from "@m/shared/ui/modal/CenterModal.jsx"
import { SKIN_PANEL_CLASS } from "../modal/modalStyle.js"

// 전신 그림이 없으면 칸 그림으로 대신함, 그림 칸 모양은 데스크톱 상수 그대로
export default function SkinZoomModal({ item, onClose }) {
    return (
        <CenterModal
            open={Boolean(item)}
            ariaLabel={item ? `${item.name} 스킨 전신 보기` : ""}
            closeLabel="스킨 확대 보기 닫기"
            onClose={onClose}
            transition={ZOOM_TRANSITION}
            panelClassName={SKIN_PANEL_CLASS}
        >
            {item ? (
                <div className={ILLUSTRATION_WRAP_CLASS}>
                    <PublicAsset src={getSkinZoomIcon(item)} alt={item.name} className={ILLUSTRATION_CLASS} />
                </div>
            ) : null}
        </CenterModal>
    )
}
