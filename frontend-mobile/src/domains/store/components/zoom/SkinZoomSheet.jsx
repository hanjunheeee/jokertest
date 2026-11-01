// 스킨 전신 보기 시트 (화면 전체에 서 있는 그림 한 장)
// pages/StorePage가 씀 (데스크톱 StoreSkinZoomOverlay 대신)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { getSkinZoomIcon } from "@/domains/store/constants/storeItems.js"
import FullSheet from "../sheet/FullSheet.jsx"

// 전신 그림이 없으면 칸 그림으로 대신함, 그림은 아래 붙여 세움
export default function SkinZoomSheet({ item, onClose }) {
    return (
        <FullSheet
            open={Boolean(item)}
            title={item ? `${item.name} 스킨 전신 보기` : ""}
            closeLabel="스킨 확대 보기 닫기"
            onClose={onClose}
            bodyClassName="flex items-end justify-center bg-[#1a0f0a]/06 px-3 pt-3 pb-[env(safe-area-inset-bottom,0px)]"
        >
            {item ? (
                <PublicAsset src={getSkinZoomIcon(item)} alt={item.name} className="block h-full max-h-full w-full select-none object-contain object-bottom" />
            ) : null}
        </FullSheet>
    )
}
