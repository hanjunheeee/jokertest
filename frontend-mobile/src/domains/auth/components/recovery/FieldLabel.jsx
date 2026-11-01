// 입력 칸 이름표 (label이 칸을 감싸서 이름을 눌러도 칸에 들어감)
// recovery 폼 3개가 씀
export default function FieldLabel({ text, children }) {
  return (
    <label className="app-text-scaled mt-2 block font-subheading font-bold text-text-body/80 [--app-text-size:13px] first:mt-0">
      {text}
      {children}
    </label>
  )
}
