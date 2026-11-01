// 글자 링크 모양 버튼 (다시 입력·재시도·다시 찾기 등), 데스크톱 auth-text-link 모양
// recovery 폼·결과 컴포넌트가 씀
const LINK_CLASS =
  "app-text-scaled mx-auto flex min-h-11 cursor-pointer items-center border-0 bg-transparent px-3 font-subheading font-bold text-amber-800 underline-offset-2 [--app-text-size:14px] [-webkit-text-stroke:0.35px_currentColor] [paint-order:stroke_fill] active:underline"

// 누르는 곳 높이 44px 확보
export default function TextLink({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={LINK_CLASS}>
      {children}
    </button>
  )
}
