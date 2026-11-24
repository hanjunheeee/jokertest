// 버튼 오른쪽 위 빨간 숫자 배지 (0이면 안 그림, 100부터 99+)
// 알림 버튼이 씀
const MOBILE_NOTIF_BADGE_CLASS =
  "absolute right-0.5 top-0 inline-flex min-h-[1.45rem] min-w-[1.45rem] items-center justify-center rounded-full bg-[#8a2b12] px-[0.35em] py-[0.06em] font-subheading app-text-scaled [--app-text-size:0.88rem] font-bold leading-none text-white land:-top-0.5 land:min-h-[1.35rem] land:min-w-[1.35rem] land:[--app-text-size:0.82rem]"

export default function CountBadge({ count }) {
    if (!count || count <= 0) return null

    return (
        <span aria-hidden="true" className={`pointer-events-none ${MOBILE_NOTIF_BADGE_CLASS}`}>
            {count > 99 ? "99+" : count}
        </span>
    )
}
