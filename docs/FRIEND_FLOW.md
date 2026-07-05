# 친구 처리 흐름

친구 목록 조회, 받은 요청 조회, 검색, 요청 전송, 수락, 거절 흐름입니다.
REST 처리 후 일부 결과는 Socket.io 이벤트로 상대에게 즉시 전달됩니다.

기존처럼 하나의 큰 흐름도에 모든 분기를 넣으면 문서 뷰어가 전체 그래프를 한 화면에 맞추면서 너무 작게 보입니다.
아래 문서는 같은 흐름을 단계별 Mermaid 블록으로 나누어, 문서 길이는 조금 길어져도 각 흐름도가 크게 보이도록 구성했습니다.

관련 파일:

- `frontend/src/domains/lobby/hooks/useFriendListSync.js`
- `frontend/src/domains/lobby/hooks/useFriendSearch.js`
- `frontend/src/domains/lobby/store/friendStore.js`
- `frontend/src/domains/lobby/api/friend.js`
- `backend/routes/friend.routes.js`
- `backend/controller/friend.controller.js`
- `backend/service/friend.service.js`
- `backend/repositories/friend.repositories.js`
- `backend/socket/socket.js`

---

## 1. 친구 패널 열림: 목록과 받은 요청 동기화

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["친구 패널 열림"] --> B["useFriendListSync"]

    B --> C["fetchMyFriends<br/>GET /friends"]
    B --> D["fetchIncomingRequests<br/>GET /friends/requests/incoming"]

    C --> E["friend.controller.getFriends"]
    E --> F["friend.service.getFriendList"]
    F --> G["Friendship 조회"]
    G --> H["OnlinePresence 조합"]
    H --> I["friendStore.friends 갱신"]

    D --> J["friend.controller.getIncomingRequests"]
    J --> K["friend.service.getIncomingRequests"]
    K --> L["PENDING FriendRequest 조회"]
    L --> M["friendStore.incomingRequests 갱신"]

    style H fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
    style L fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
    style I fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
    style M fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

핵심은 친구 관계와 접속 상태가 분리되어 있다는 점입니다.
친구 목록은 `Friendship`을 기준으로 가져오고, 온라인 여부는 `OnlinePresence`와 조합해서 프론트에 내려갑니다.

---

## 2. 친구 검색

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["친구 검색어 입력"] --> B["useFriendSearch.handleSearch"]
    B --> C["GET /friends/search?q=..."]
    C --> D["friend.controller.searchUsers"]
    D --> E["friend.service.searchUsers"]

    E --> F["본인 제외"]
    F --> G["이미 친구인 유저 제외"]
    G --> H["이미 신청 중인 유저 표시 또는 제외"]
    H --> I["검색 결과 렌더링"]

    style E fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
    style I fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

`useFriendSearch`는 검색 결과와 함께 `sentRequestIds` 상태를 관리합니다.
이미 요청한 사용자는 버튼 상태를 바꾸거나 중복 요청을 막는 데 이 값이 쓰입니다.

---

## 3. 친구 요청 보내기

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["친구 요청 보내기 클릭"] --> B["POST /friends/requests<br/>{ receiverId }"]
    B --> C["friend.controller.sendFriendRequest"]
    C --> D["friend.service.sendFriendRequest"]

    D --> E{"요청 가능?"}
    E -- "아니오: 자기 자신" --> F["400 Bad Request"]
    E -- "아니오: 이미 친구" --> G["409 Conflict"]
    E -- "아니오: 이미 신청 중" --> H["409 Conflict"]
    E -- "예" --> I["FriendRequest 생성<br/>status=PENDING"]

    I --> J["emitToUser(receiver)"]
    J --> K["friend_request_received"]
    K --> L["상대 useSocket 수신"]
    L --> M["받은 요청 목록 재조회"]

    style F fill:#f8d7da,stroke:#9c3b36,color:#5a1f1c
    style G fill:#f8d7da,stroke:#9c3b36,color:#5a1f1c
    style H fill:#f8d7da,stroke:#9c3b36,color:#5a1f1c
    style I fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
    style M fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

요청 생성에 성공하면 REST 응답만 끝나는 것이 아니라, 받는 사람에게 Socket.io 이벤트가 갑니다.
상대 클라이언트는 `friend_request_received` 이벤트를 받고 받은 요청 목록을 다시 가져옵니다.

---

## 4. 받은 요청 수락

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["받은 요청 수락 클릭"] --> B["PUT /friends/requests/:id/accept"]
    B --> C["friend.controller.acceptFriendRequest"]
    C --> D["friend.service.acceptFriendRequest"]

    D --> E["요청 존재 여부 확인"]
    E --> F["요청 수신자가 현재 사용자인지 확인"]
    F --> G["status=PENDING 확인"]
    G --> H["FriendRequest status=ACCEPTED"]
    H --> I["Friendship 생성"]

    I --> J["emitToUser(requester)"]
    J --> K["friend_request_accepted"]
    K --> L["요청 보낸 사람 sentRequestIds 정리"]

    I --> M["수락한 사람 프론트 처리"]
    M --> N["받은 요청 목록에서 제거"]
    N --> O["친구 목록 재조회"]

    style H fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
    style I fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
    style L fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
    style O fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

수락한 쪽 프론트는 받은 요청을 낙관적으로 목록에서 제거합니다.
그리고 새 친구가 추가되었으므로 친구 목록도 다시 가져옵니다.

---

## 5. 받은 요청 거절

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["받은 요청 거절 클릭"] --> B["PUT /friends/requests/:id/decline"]
    B --> C["friend.controller.declineFriendRequest"]
    C --> D["friend.service.declineFriendRequest"]

    D --> E["요청 존재 여부 확인"]
    E --> F["요청 수신자가 현재 사용자인지 확인"]
    F --> G["status=PENDING 확인"]
    G --> H["FriendRequest status=DECLINED"]

    H --> I["emitToUser(requester)"]
    I --> J["friend_request_declined"]
    J --> K["요청 보낸 사람 sentRequestIds 정리"]

    H --> L["거절한 사람 프론트 처리"]
    L --> M["받은 요청 목록에서 제거"]

    style H fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
    style K fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
    style M fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

거절은 친구 관계를 만들지 않습니다.
대신 요청 상태만 `DECLINED`로 바꾸고, 요청을 보낸 사람에게 소켓 이벤트를 보내 신청 중 상태를 정리하게 합니다.

---

## 6. Socket.io 이벤트 기준으로 다시 보기

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["friend_request_received"] --> B["받는 사람 클라이언트"]
    B --> C["받은 요청 목록 재조회"]

    D["friend_request_accepted"] --> E["요청 보낸 사람 클라이언트"]
    E --> F["sentRequestIds에서 제거"]
    F --> G["필요 시 친구 목록 갱신"]

    H["friend_request_declined"] --> I["요청 보낸 사람 클라이언트"]
    I --> J["sentRequestIds에서 제거"]

    style C fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
    style G fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
    style J fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

소켓 이벤트는 DB 처리의 원천이 아니라, REST 처리 결과를 상대 클라이언트에 즉시 알려주는 역할입니다.
실제 데이터 정합성은 REST API와 서비스 계층의 검증 및 DB 업데이트가 책임집니다.

---

## 실제 코드에서 주의할 점 3가지

1. **받은 요청 수락/거절 후 프론트는 낙관적으로 목록에서 제거합니다.** 수락 시에는 친구 목록도 다시 가져옵니다.
2. **요청을 보낸 사람에게는 소켓 이벤트가 갑니다.** `friend_request_accepted/declined`로 `sentRequestIds`를 정리합니다.
3. **친구 목록의 online 상태는 `OnlinePresence`와 조합합니다.** 친구 관계 자체와 접속 상태 저장소가 분리되어 있습니다.

---

## 단계별 코드 위치

| 단계 | 파일:라인 | 내용 |
| --- | --- | --- |
| 친구 목록 동기화 | `useFriendListSync.js:19-76` | 패널 열림, 새로고침, 수락/거절 핸들러 |
| 친구 검색 | `useFriendSearch.js:12-61` | 검색, 요청 전송, sent/resolved 상태 |
| 친구 store | `friendStore.js` | friends/incomingRequests/sentRequestIds 관리 |
| 프론트 API | `friend.js` | `/friends` 계열 API 래퍼 |
| 라우트 | `friend.routes.js` | 모든 친구 API에 `verifyToken` 적용 |
| 컨트롤러 | `friend.controller.js` | REST 응답 + `emitToUser` 호출 |
| 서비스 | `friend.service.js` | 친구/요청 검증과 DB 처리 |
