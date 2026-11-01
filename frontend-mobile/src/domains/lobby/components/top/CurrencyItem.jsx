// 재화 한 칸 (그림 + 숫자, 받기 전엔 ··· 표시)
// CurrencyBalance가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 큰 숫자도 칸을 넘지 않게 tabular 숫자·말줄임
export default function CurrencyItem({ icon, label, amount, ready }) {
    return (
        <div
            className="flex h-7 min-w-[5.5rem] items-center gap-1.5 rounded-full border border-[#c9a45c]/45 bg-black/60 pl-1 pr-2.5 md:h-9"
            aria-label={ready ? `${label} ${amount}` : `${label} 불러오는 중`}
        >
            <PublicAsset src={icon} alt="" className="block h-5 w-6 shrink-0 select-none object-contain md:h-6" />
            <span
                className="ml-auto max-w-[6rem] truncate font-subheading text-sm font-bold tabular-nums text-[#ebe2cc]"
                aria-hidden="true"
            >
                {ready ? amount.toLocaleString() : "···"}
            </span>
        </div>
    )
}
