// pm2 설정 파일, Docker 없이 서버에 바로 Node로 띄울 때 죽으면 다시 켜기 (pm2는 따로 설치: npm i -g pm2)
// 쓰는 법: backend 폴더에서 pm2 start ecosystem.config.cjs → pm2 save → pm2 startup (docs/운영_준비_2026-11-09.md)
module.exports = {
    apps: [
        {
            name: "mmc-backend",
            script: "index.js",
            cwd: __dirname,
            // 판 상태가 프로세스 메모리에 있어 한 개만 (여러 개면 판이 프로세스마다 갈림)
            instances: 1,
            exec_mode: "fork",
            // 죽으면 다시 켬: 1초 기다렸다 켜고, 10초 못 버티고 죽는 게 10번 이어지면 멈춤 (고장 난 채 무한 재시작 막기)
            autorestart: true,
            restart_delay: 1000,
            min_uptime: "10s",
            max_restarts: 10,
            // 메모리 1GB 넘으면 다시 켬 (새는 것 막기, 서버 사양에 맞게 조절)
            max_memory_restart: "1G",
            // 종료 신호 뒤 정리(점검 안내·소켓·DB 닫기)까지 기다림, 앱 강제 종료(10초)보다 길게
            kill_timeout: 15000,
            env: {
                NODE_ENV: "production",
            },
            // 앱이 logs/app-날짜.log를 따로 남김, pm2 자체 로그는 시각만 붙임
            time: true,
        },
    ],
};
