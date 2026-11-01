// 친구 폴더 머리 (폴더 아이콘·이름·펼침 화살표, 누르면 열고 닫음)
// FriendListFolder가 폴더 맨 위에 그림
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import {
  FOLDER_CHEVRON_CLASS,
  FOLDER_HEADER_CLASS,
  FOLDER_ICON_CLASS,
  FOLDER_LABEL_CLASS,
} from "../../../../constants/friendListStyle.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 열림 상태에 맞춰 폴더·화살표 그림을 바꿈
export default function FriendListFolderHeader({ label, open, onToggle }) {
  const folderIcon = open ? FRIEND_LIST_ASSETS.folderOpen : FRIEND_LIST_ASSETS.folderClosed
  const chevronIcon = open ? FRIEND_LIST_ASSETS.chevronUp : FRIEND_LIST_ASSETS.chevronDown

  return (
    <button
      type="button"
      onClick={onToggle}
      className={FOLDER_HEADER_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={folderIcon} alt="" className={FOLDER_ICON_CLASS} />
      <span className={FOLDER_LABEL_CLASS}>{label}</span>
      <PublicAsset src={chevronIcon} alt="" className={FOLDER_CHEVRON_CLASS} />
    </button>
  )
}
