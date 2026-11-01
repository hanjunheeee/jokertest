// 친구 폴더 한 칸의 바탕 (배경 + 안쪽 내용)
// FriendListFolder가 폴더마다 감쌈
import {
  FRIEND_FOLDER_BACKDROP_CLASS,
  FRIEND_FOLDER_CONTENT_CLASS,
  FRIEND_FOLDER_SECTION_CLASS,
} from "../../../../constants/friendListStyle.js"

// 바깥에서 준 className으로 폴더 사이 간격만 더함
export default function FriendListFolderSection({ children, className = "" }) {
  return (
    <section className={`${FRIEND_FOLDER_SECTION_CLASS} ${className}`}>
      <div className={FRIEND_FOLDER_BACKDROP_CLASS} aria-hidden="true" />
      <div className={FRIEND_FOLDER_CONTENT_CLASS}>{children}</div>
    </section>
  )
}
