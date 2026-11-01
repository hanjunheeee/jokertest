// 프로필 편집 미리보기 (둥근 사진 + 테두리 겹침)
// ProfileEditSheet가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 사진은 둥근 칸 안, 테두리는 위에 겹침 (데스크톱 ProfileEditPreview와 같은 비율)
export default function Preview({ photoSrc, frameSrc }) {
  return (
    <section
      aria-label="프로필 미리보기"
      className="flex shrink-0 items-center justify-center border-b border-[#2a1810]/12 py-4 land:border-b-0 land:py-2"
    >
      <div className="relative aspect-square w-[min(9rem,32vw)] select-none land:w-[min(9rem,38svh)] md:w-40">
        <div className="absolute left-1/2 top-1/2 z-[1] aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
          <PublicAsset src={photoSrc} alt="" className="block h-full w-full scale-[1.28] select-none object-cover object-center" />
        </div>
        <PublicAsset src={frameSrc} alt="" className="pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain" />
      </div>
    </section>
  )
}
