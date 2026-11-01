// 버튼 오른쪽 위 빨간 숫자 배지 (0이면 안 그림, 100부터 99+)
// 알림·친구 버튼이 씀
export default function CountBadge({ count }) {
    if (!count || count <= 0) return null

    return (
        <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-1 inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-[#8a2b12] px-[0.35em] py-[0.08em] font-subheading text-xs font-bold leading-tight text-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        >
            {count > 99 ? "99+" : count}
        </span>
    )
}
