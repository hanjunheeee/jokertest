# 소켓 / 접속 상태 처리 흐름

로그인 상태에 따라 프론트가 Socket.io 연결을 맺고, 백엔드는 쿠키 JWT 인증, 단일 접속 제어, 친구 접속 상태 브로드캐스트를 처리합니다.

연결, 인증, 강제 종료, disconnect, 프론트 이벤트 수신을 각각 나누어 크게 보이도록 구성했습니다.

관련 파일:

- `frontend/src/app/App.jsx`
- `frontend/src/shared/hooks/useSocket.js`
- `frontend/src/shared/socket/socketClient.js`
- `frontend/src/domains/lobby/store/friendStore.js`
- `backend/socket/socket.js`
- `backend/service/presence.service.js`
- `backend/repositories/friend.repositories.js`
- `backend/repositories/user.repositories.js`

---

## 1. 프론트 소켓 연결 시작

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["App.jsx"] --> B["useSocket"]
    B --> C{"isLoggedIn 인가?"}
    C -- "아니오" --> D["소켓 연결 없음"]
    C -- "예" --> E["io(SOCKET_URL)"]
    E --> F["withCredentials + websocket"]
    F --> G["Socket.io handshake"]

    style D fill:#fff3cd,stroke:#9c7a20,color:#5a4210
    style G fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

프론트는 로그인 상태일 때만 소켓을 연결하고, 쿠키를 함께 보내기 위해 `withCredentials`를 사용합니다.

---

## 2. 소켓 인증과 단일 접속 제어

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["socket.js authenticateSocket"] --> B{"accessToken 쿠키 JWT 유효?"}
    B -- "아니오" --> C["connect_error<br/>UNAUTHORIZED"]
    B -- "예" --> D["socket.data.user 저장"]
    D --> E["handleConnection"]
    E --> F{"같은 uuid 기존 소켓 있음?"}
    F -- "예" --> G["기존 소켓 force_disconnect"]
    G --> H["forcedLogout=true 후 disconnect"]
    F -- "아니오" --> I["새 소켓 등록 단계"]
    H --> I

    style C fill:#f8d7da,stroke:#9c3b36,color:#5a1f1c
    style I fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
```

동일 유저는 소켓 하나만 유지합니다.
새 소켓이 연결되면 기존 소켓에 `force_disconnect`를 보내고 끊습니다.

---

## 3. ONLINE 반영과 친구 상태 브로드캐스트

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["새 소켓 등록 단계"] --> B["onlineUsers.set(uuid, socket.id)"]
    B --> C["presenceService.setPresence(ONLINE)"]
    C --> D["broadcastFriendStatus"]
    D --> E["ACCEPTED 친구 조회"]
    E --> F["friend_status_change 전송"]

    style C fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
    style F fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
```

접속 상태 변경은 친구 관계가 `ACCEPTED`인 사용자들에게만 브로드캐스트됩니다.

---

## 4. disconnect와 OFFLINE 처리

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["socket disconnect"] --> B["handleDisconnect"]
    B --> C{"forcedLogout 또는 최신 소켓 아님?"}
    C -- "예" --> D["OFFLINE 처리 생략"]
    C -- "아니오" --> E["onlineUsers.delete(uuid)"]
    E --> F["presenceService.setPresence(OFFLINE)"]
    F --> G["친구에게 OFFLINE 브로드캐스트"]
    G --> H["recordLogout(uuid)"]

    style D fill:#fff3cd,stroke:#9c7a20,color:#5a4210
    style H fill:#d9ead3,stroke:#2f6f52,color:#1f4a34
```

강제 종료된 구 소켓은 OFFLINE을 덮어쓰지 못합니다.
`forcedLogout` 플래그와 `onlineUsers` 맵 비교로 레이스를 막습니다.

---

## 5. 프론트 이벤트 수신

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 70, "rankSpacing": 90, "curve": "basis"}}}%%
flowchart TD
    A["프론트 이벤트 수신"] --> B["friend_status_change"]
    B --> C["friendStore.updateFriendStatus"]

    A --> D["friend_request_received"]
    D --> E["받은 요청 재조회"]

    A --> F["match_found"]
    F --> G["matchingStore.setRoom"]

    style C fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
    style E fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
    style G fill:#e7f0ff,stroke:#4b6fa8,color:#1f355d
```

`emitToUser`는 현재 온라인인 유저에게만 보냅니다.
오프라인이면 이벤트를 저장하지 않고 무시합니다.

---

## 실제 코드에서 주의할 점 3가지

1. **동일 유저는 소켓 하나만 유지합니다.** 새 소켓이 연결되면 기존 소켓에 `force_disconnect`를 보내고 끊습니다.
2. **강제 종료된 구 소켓은 OFFLINE을 덮어쓰지 못합니다.** `forcedLogout` 플래그와 `onlineUsers` 맵 비교로 레이스를 막습니다.
3. **`emitToUser`는 현재 온라인인 유저에게만 보냅니다.** 오프라인이면 이벤트를 저장하지 않고 무시합니다.

---

## 단계별 코드 위치

| 단계 | 파일:라인 | 내용 |
| --- | --- | --- |
| 소켓 훅 실행 | `App.jsx` | 앱 최상단에서 `useSocket()` 호출 |
| 소켓 연결 | `useSocket.js:24-93` | 로그인 상태에 따라 연결/이벤트 구독/cleanup |
| 소켓 공유 | `socketClient.js` | 다른 훅에서 emit할 수 있도록 싱글턴 저장 |
| 인증 | `socket.js:86-97` | 핸드셰이크 쿠키 JWT 검증 |
| 연결 처리 | `socket.js:106-125` | 단일 접속 제어, ONLINE 반영 |
| 해제 처리 | `socket.js:136-144` | OFFLINE 반영, 로그아웃 기록 |
| 브로드캐스트 | `socket.js:152-161` | ACCEPTED 친구에게 상태 전파 |
