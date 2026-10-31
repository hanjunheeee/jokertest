require("dotenv").config();

const http         = require("http");
const express      = require("express");
const cookieParser = require("cookie-parser");
const cors         = require("cors");
const morgan       = require("morgan");

const failStartup = (error) => {
    const reason = String(error?.message ?? error ?? "unknown error")
        .replace(/\s+/g, " ")
        .trim();
    console.error(`[STARTUP] 실패 — DB 연결: ${reason}`);
    process.exit(1);
};

let db;
try {
    db = require("./models");
} catch (error) {
    failStartup(error);
}

const { notFoundHandler, globalErrorHandler } = require("./middleware/errorHandler");
const authRouter     = require("./routes/auth.routes");
const userRouter     = require("./routes/user.routes");
const friendRouter   = require("./routes/friend.routes");
const gameRouter     = require("./routes/game.routes");
const economyRouter  = require("./routes/economy.routes");
const notificationRouter = require("./routes/notification.routes");
const { initSocket } = require("./socket/socket");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

const isPasswordResetScopedPath = (req) => String(req.originalUrl || req.url || '')
    .split('?')[0].replace(/\/+$/, '').toLowerCase().startsWith('/auth/password-reset');
const isSignupScopedPath = (req) => String(req.originalUrl || req.url || '')
    .split('?')[0].replace(/\/+$/, '').toLowerCase().startsWith('/auth/signup');
app.use((req, res, next) => {
    if (isPasswordResetScopedPath(req) || isSignupScopedPath(req)) res.set('Cache-Control', 'no-store');
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
morgan.token("safe-url", (req) => (
    isPasswordResetScopedPath(req) ? "/auth/password-reset/[REDACTED]"
        : isSignupScopedPath(req) ? "/auth/signup/[REDACTED]"
        : (req.originalUrl || req.url)
));
app.use(morgan(":method :safe-url :status :response-time ms"));
app.set("trust proxy", 1);

app.use("/auth", authRouter); // F-29a: 이 마운트로 POST /auth/find-id(accountRecovery.controller.js::findId)까지 실제로 연결된다.
app.use("/user", userRouter);
app.use("/friends", friendRouter);
app.use("/game", gameRouter);
app.use("/economy", economyRouter);
app.use("/notifications", notificationRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

const server = http.createServer(app);
const io = initSocket(server);

const port = Number(process.env.PORT) || 4000;

db.sequelize.sync({force: false})
    .then(() => {
        const pool = db.sequelize.options.pool ?? {};
        server.listen(port, () => {
            console.log(
                `[STARTUP] 성공 — port=${port} DB 연결·동기화 완료; pool max=${pool.max} min=${pool.min} idle=${pool.idle}ms acquire=${pool.acquire}ms`
            );
        });
    })
    .catch((err) => {
        failStartup(err);
    })

module.exports = { app, server, io };
