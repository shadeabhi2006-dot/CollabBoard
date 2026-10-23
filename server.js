
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "room.html"));
});

function sanitizeRoomId(value) {
    return String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 40);
}

function getRoom(id) {
    if (!rooms.has(id)) {
        rooms.set(id, {
            users: new Map(),
            operations: []
        });
    }
    return rooms.get(id);
}

function sendUsers(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const users = [...room.users.values()];
    io.to(roomId).emit("room-users", users);
    io.to(roomId).emit("participants", users);
}

function removeFromRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    socket.leave(roomId);

    if (room) {
        room.users.delete(socket.id);

        io.to(roomId).emit("system-message", {
            message: `${socket.data.username || "A participant"} left the room.`,
            time: new Date().toISOString()
        });

        sendUsers(roomId);

        if (room.users.size === 0) {
            rooms.delete(roomId);
        }
    }

    socket.data.roomId = null;
}

io.on("connection", socket => {
    socket.on("join-room", data => {
        if (!data || typeof data !== "object") return;

        const roomId = sanitizeRoomId(data.roomId);
        const username = String(data.username || "Guest")
            .trim()
            .slice(0, 30) || "Guest";

        if (!roomId) {
            socket.emit("room-error", "Invalid Room ID.");
            return;
        }

        if (socket.data.roomId) {
            removeFromRoom(socket);
        }

        const room = getRoom(roomId);

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.username = username;

        room.users.set(socket.id, {
            id: socket.id,
            username
        });

        socket.emit("room-joined", { roomId, username });
        socket.emit("board-history", room.operations);

        sendUsers(roomId);

        io.to(roomId).emit("system-message", {
            message: `${username} joined the room.`,
            time: new Date().toISOString()
        });
    });

    socket.on("board-operation", operation => {
        const roomId = socket.data.roomId;
        const room = rooms.get(roomId);

        if (!room || !operation || typeof operation !== "object") return;

        let safeOperation;

        if (operation.type === "stroke") {
            const values = [
                operation.x0,
                operation.y0,
                operation.x1,
                operation.y1
            ].map(Number);

            if (!values.every(Number.isFinite)) return;
            if (values.some(value => value < 0 || value > 1)) return;

            const color = operation.color;
            if (
                typeof color !== "string" ||
                !/^#[0-9a-fA-F]{6}$/.test(color)
            ) return;

            safeOperation = {
                type: "stroke",
                x0: values[0],
                y0: values[1],
                x1: values[2],
                y1: values[3],
                color,
                size: Math.max(1, Math.min(50, Number(operation.size) || 5)),
                tool: operation.tool === "eraser" ? "eraser" : "pen"
            };
        } else if (operation.type === "bucket-fill") {
            const x = Number(operation.x);
            const y = Number(operation.y);

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                x < 0 || x > 1 ||
                y < 0 || y > 1
            ) return;

            if (
                typeof operation.color !== "string" ||
                !/^#[0-9a-fA-F]{6}$/.test(operation.color)
            ) return;

            safeOperation = {
                type: "bucket-fill",
                x,
                y,
                color: operation.color
            };
        } else if (operation.type === "clear") {
            safeOperation = { type: "clear" };
        } else {
            return;
        }

        room.operations.push(safeOperation);

        // Keep operation history bounded.
        if (room.operations.length > 20000) {
            room.operations.splice(0, room.operations.length - 20000);
        }

        // Send to everyone, including sender, so operation order is consistent.
        io.to(roomId).emit("board-operation", safeOperation);
    });

    socket.on("chat-message", data => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms.has(roomId)) return;
        if (!data || typeof data.message !== "string") return;

        const message = data.message.trim().slice(0, 500);
        if (!message) return;

        io.to(roomId).emit("chat-message", {
            username: socket.data.username || "Guest",
            message,
            time: new Date().toISOString(),
            socketId: socket.id
        });
    });

    socket.on("disconnect", () => {
        removeFromRoom(socket);
    });
});

server.listen(PORT, () => {
    console.log(`CollabBoard running at http://localhost:${PORT}`);
});
