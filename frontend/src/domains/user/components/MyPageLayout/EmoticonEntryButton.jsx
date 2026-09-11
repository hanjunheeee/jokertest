import MyPageFramedButton from "./MyPageFramedButton.jsx"

// F-13 AC-06: 마이페이지에 이모티콘 진입 버튼만 추가한다. onOpenEmoticons는 선택 값이고,
// 넘기지 않으면 클릭해도 아무 화면·요청도 생기지 않는다(ProfileEditButton/SkinCardWearButton과
// 같은 버튼 껍데기를 재사용하되, 이 버튼의 탭 내용·모달·장착 슬롯·보유 목록은 이 슬라이스
// 범위 밖이라 만들지 않는다 — MyPageLayout도 지금은 콜백을 넘기지 않는다).
export default function EmoticonEntryButton({ onOpenEmoticons = () => {} }) {
  return <MyPageFramedButton label="이모티콘" onClick={onOpenEmoticons} />
}
