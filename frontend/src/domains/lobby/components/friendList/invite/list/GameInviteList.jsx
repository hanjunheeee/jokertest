// 받은 게임 초대 목록 (비었으면 불러오는 중·없음 안내)
// GameInviteTab이 그림
import { ACCEPT_EMPTY_CLASS, ACCEPT_LIST_CLASS } from "../../../../constants/friendListStyle.js"
import GameInviteRow from "./GameInviteRow.jsx"

// 처리 중·오류·대상 표시는 초대 id로 골라 줄에 넘김
export default function GameInviteList({ invites, status, pendingInviteIds, inviteErrors, onAccept, onDecline, targetInviteId }) {
  return (
    <ul className={ACCEPT_LIST_CLASS} aria-label="받은 게임 초대">
      {invites.length === 0 ? (
        <li className={ACCEPT_EMPTY_CLASS}>
          {status === "loading" ? "초대를 불러오는 중입니다." : "받은 게임 초대가 없습니다."}
        </li>
      ) : (
        invites.map((invite) => (
          <GameInviteRow
            key={invite.inviteId}
            invite={invite}
            onAccept={onAccept}
            onDecline={onDecline}
            processing={pendingInviteIds.has(invite.inviteId)}
            error={inviteErrors[invite.inviteId] ?? null}
            targeted={targetInviteId !== null && invite.inviteId === targetInviteId}
          />
        ))
      )}
    </ul>
  )
}
