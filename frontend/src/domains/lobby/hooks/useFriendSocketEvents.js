import { useEffect } from "react";
import { useFriendStore } from "@/domains/lobby/store/friend.store";

// 친구 도메인에서 사용하는 socket 이벤트만 연결하는 훅입니다.
export function useFriendSocketEvents(socket) {
    // 친구 접속 상태가 바뀌었을 때 store 안의 친구 상태를 갱신하는 함수입니다.
    const updateFriendStatus = useFriendStore((state) => state.updateFriendStatus);

    // 친구 요청 수락처럼 친구 목록이 바뀌는 이벤트가 오면 목록을 다시 가져오는 함수입니다.
    const fetchFriends = useFriendStore((state) => state.fetchFriends);

    // 새 친구 요청이 도착했을 때 받은 요청 목록을 다시 가져오는 함수입니다.
    const fetchIncomingRequests = useFriendStore((state) => state.fetchIncomingRequests);

    // 내가 보낸 친구 요청이 수락/거절되면 보낸 요청 표시를 지우는 함수입니다.
    const removeSentRequest = useFriendStore((state) => state.removeSentRequest);

    useEffect(() => {
        // 아직 socket 연결이 만들어지지 않았다면 이벤트를 등록하지 않습니다.
        if (!socket) return;

        socket.on("friend_status_change", ({ uuid, status }) => {
            // 친구가 접속/오프라인 상태로 바뀌면 현재 친구 목록의 상태값만 갱신합니다.
            updateFriendStatus(uuid, status);
        });

        socket.on("friend_request_received", () => {
            // 새 친구 요청이 왔으므로 받은 요청 목록을 서버에서 다시 가져옵니다.
            fetchIncomingRequests();
        });

        socket.on("friend_request_accepted", ({ byUuid }) => {
            // 내 요청이 수락되면 친구 목록을 다시 가져와 새 친구를 반영합니다.
            fetchFriends();

            // 수락한 사용자를 보낸 요청 목록에서 제거합니다.
            if (byUuid) removeSentRequest(byUuid);
        });

        socket.on("friend_request_declined", ({ byUuid }) => {
            // 거절된 요청도 더 이상 "보낸 요청 중"으로 보여주면 안 됩니다.
            if (byUuid) removeSentRequest(byUuid);
        });

        return () => {
            // 이 훅에서 등록한 친구 이벤트만 제거합니다.
            socket.off("friend_status_change");
            socket.off("friend_request_received");
            socket.off("friend_request_accepted");
            socket.off("friend_request_declined");
        };
    }, [socket, updateFriendStatus, fetchFriends, fetchIncomingRequests, removeSentRequest]);
}
