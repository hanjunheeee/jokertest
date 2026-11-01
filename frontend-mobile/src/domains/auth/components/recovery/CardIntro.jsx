// 양피지 카드 맨 위 안내 문구 한 줄 (화면마다 문구만 다름)
// recovery 폼 3개가 씀
export default function CardIntro({ children }) {
  return (
    <p className="app-text-scaled mb-3 break-keep text-center font-subheading font-bold leading-relaxed text-text-body/90 [--app-text-size:14px]">
      {children}
    </p>
  )
}
