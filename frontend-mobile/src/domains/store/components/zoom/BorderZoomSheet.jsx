// 프로필 테두리 크게 보기 시트 (테두리 그림·이름)
// pages/StorePage가 씀 (데스크톱 공용 ProfileBorderZoomOverlay는 화면 파일이라 못 불러서 따로)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import BottomSheet from "../sheet/BottomSheet.jsx"

// item = { icon, label } (데스크톱 getProfileBorderZoomItem 모양)
export default function BorderZoomSheet({ item, onClose }) {
    return (
        <BottomSheet
            open={Boolean(item)}
            title={item ? `${item.label} 보기` : ""}
            closeLabel="프로필 테두리 확대 보기 닫기"
            onClose={onClose}
        >
            {item ? (
                <div className="flex flex-col items-center gap-3 py-2">
                    <PublicAsset
                        src={item.icon}
                        alt={item.label}
                        className="block aspect-square w-[min(18rem,70vw,52svh)] select-none object-contain"
                    />
                    <p className="font-subheading app-text-scaled [--app-text-size:0.95rem] font-black text-[#120a06]">{item.label}</p>
                </div>
            ) : null}
        </BottomSheet>
    )
}
