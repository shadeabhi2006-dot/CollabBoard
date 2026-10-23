
(() => {
    "use strict";

    const canvas = document.getElementById("drawingCanvas");
    if (!canvas) {
        console.error("CollabBoard: drawingCanvas not found.");
        return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const $ = id => document.getElementById(id);

    const colorPicker = $("colorPicker");
    const brushSize = $("brushSize");
    const brushSizeValue = $("brushSizeValue");
    const fillButton = $("fillBoard");
    const clearButton = $("clearBoard");
    const roomIdLabel = $("roomIdLabel");
    const copyRoomIdButton = $("copyRoomId");
    const copyStatus = $("copyStatus");
    const leaveRoomButton = $("leaveRoom");

    const params = new URLSearchParams(location.search);
    const roomId = params.get("room") || localStorage.getItem("roomId") || "";
    const username = params.get("username") || localStorage.getItem("username") || "Guest";

    if (!roomId) {
        alert("No Room ID found. Please create or join a room.");
        location.replace("/");
        return;
    }

    localStorage.setItem("roomId", roomId);
    localStorage.setItem("username", username);

    if (roomIdLabel) roomIdLabel.textContent = roomId;

    if (typeof window.io !== "function") {
        alert("Socket.IO failed to load. Restart the server and try again.");
        return;
    }

    const socket = window.io();

    let tool = "pen";
    let color = colorPicker?.value || "#315b87";
    let size = Number(brushSize?.value || 5);

    let drawing = false;
    let lastPoint = null;
    let operations = [];
    let background = "#fffef9";

    let cssWidth = 0;
    let cssHeight = 0;
    let pixelRatio = 1;

    // Each operation is replayed in the same order for every participant.
    function validColor(value) {
        return typeof value === "string" &&
            /^#[0-9a-f]{6}$/i.test(value);
    }

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        cssWidth = rect.width;
        cssHeight = rect.height;
        pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.round(cssWidth * pixelRatio);
        canvas.height = Math.round(cssHeight * pixelRatio);

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        renderBoard();
    }

    function pointFromEvent(event) {
        const rect = canvas.getBoundingClientRect();

        return {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
        };
    }

    function paintStroke(op) {
        const x0 = op.x0 * cssWidth;
        const y0 = op.y0 * cssHeight;
        const x1 = op.x1 * cssWidth;
        const y1 = op.y1 * cssHeight;

        ctx.save();
        ctx.globalCompositeOperation =
            op.tool === "eraser" ? "destination-out" : "source-over";

        ctx.strokeStyle = op.tool === "eraser" ? "#000" : op.color;
        ctx.fillStyle = op.tool === "eraser" ? "#000" : op.color;
        ctx.lineWidth = Math.max(1, Math.min(50, Number(op.size) || 5));
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        // A dot ensures a tap without movement is visible.
        if (Math.abs(x1 - x0) < 0.1 && Math.abs(y1 - y0) < 0.1) {
            ctx.beginPath();
            ctx.arc(x0, y0, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // Flood fill only the connected region at the selected point.
    // Outline gaps can allow a fill to escape, as with most bucket tools.
    function paintBucket(op) {
        if (!validColor(op.color)) return;

        const width = canvas.width;
        const height = canvas.height;

        const startX = Math.floor(op.x * width);
        const startY = Math.floor(op.y * height);

        if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
            return;
        }

        const image = ctx.getImageData(0, 0, width, height);
        const pixels = image.data;
        const start = (startY * width + startX) * 4;

        const target = [
            pixels[start],
            pixels[start + 1],
            pixels[start + 2],
            pixels[start + 3]
        ];

        const hex = op.color.slice(1);
        const replacement = [
            parseInt(hex.slice(0, 2), 16),
            parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16),
            255
        ];

        if (target.every((v, i) => v === replacement[i])) return;

        const tolerance = 24;
        const total = width * height;
        const visited = new Uint8Array(total);
        const stack = [startX, startY];

        function matches(index) {
            return Math.abs(pixels[index] - target[0]) <= tolerance &&
                Math.abs(pixels[index + 1] - target[1]) <= tolerance &&
                Math.abs(pixels[index + 2] - target[2]) <= tolerance &&
                Math.abs(pixels[index + 3] - target[3]) <= tolerance;
        }

        let processed = 0;

        while (stack.length >= 2 && processed < total) {
            const y = stack.pop();
            const x = stack.pop();

            if (x < 0 || y < 0 || x >= width || y >= height) continue;

            const position = y * width + x;
            if (visited[position]) continue;

            visited[position] = 1;
            processed++;

            const index = position * 4;
            if (!matches(index)) continue;

            pixels[index] = replacement[0];
            pixels[index + 1] = replacement[1];
            pixels[index + 2] = replacement[2];
            pixels[index + 3] = 255;

            stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
        }

        ctx.putImageData(image, 0, 0);
    }

    function applyOperation(op) {
        if (!op) return;

        if (op.type === "stroke") {
            paintStroke(op);
        } else if (op.type === "bucket-fill") {
            paintBucket(op);
        } else if (op.type === "clear") {
            background = "#fffef9";
            ctx.clearRect(0, 0, cssWidth, cssHeight);
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, cssWidth, cssHeight);
        } else if (op.type === "background") {
            if (!validColor(op.color)) return;
            background = op.color;
            ctx.clearRect(0, 0, cssWidth, cssHeight);
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, cssWidth, cssHeight);
        }
    }

    function renderBoard() {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, cssWidth, cssHeight);
        ctx.restore();

        for (const op of operations) applyOperation(op);
    }

    function receiveOperation(op) {
        if (!op || typeof op !== "object") return;
        operations.push(op);
        applyOperation(op);
    }

    function emitOperation(op) {
        operations.push(op);
        applyOperation(op);
        socket.emit("board-operation", op);
    }

    function chooseTool(nextTool) {
        tool = ["pen", "eraser", "fill"].includes(nextTool)
            ? nextTool
            : "pen";

        document.querySelectorAll("[data-tool]").forEach(button => {
            const active = button.dataset.tool === tool;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        canvas.style.cursor = tool === "eraser" ? "cell" : "crosshair";
    }

    document.querySelectorAll("[data-tool]").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            chooseTool(button.dataset.tool);
        });
    });

    // The fill button selects the bucket; it does NOT fill the entire canvas.
    if (fillButton) {
        fillButton.addEventListener("click", event => {
            event.preventDefault();
            chooseTool("fill");
        });
    }

    function chooseColor(nextColor) {
        if (!validColor(nextColor)) return;
        color = nextColor;

        if (colorPicker) colorPicker.value = color;

        document.querySelectorAll("[data-color]").forEach(button => {
            button.classList.toggle(
                "selected",
                button.dataset.color.toLowerCase() === color.toLowerCase()
            );
        });

        chooseTool("pen");
    }

    if (colorPicker) {
        colorPicker.addEventListener("input", () => chooseColor(colorPicker.value));
        colorPicker.addEventListener("change", () => chooseColor(colorPicker.value));
    }

    document.querySelectorAll("[data-color]").forEach(button => {
        button.addEventListener("click", () => chooseColor(button.dataset.color));
    });

    function updateSize() {
        if (!brushSize) return;

        size = Math.max(1, Math.min(50, Number(brushSize.value) || 5));
        if (brushSizeValue) brushSizeValue.textContent = String(size);
    }

    if (brushSize) {
        brushSize.addEventListener("input", updateSize);
        brushSize.addEventListener("change", updateSize);
    }

    function startDrawing(event) {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();

        const point = pointFromEvent(event);

        if (tool === "fill") {
            emitOperation({
                type: "bucket-fill",
                x: point.x,
                y: point.y,
                color
            });
            return;
        }

        drawing = true;
        lastPoint = point;

        try {
            canvas.setPointerCapture(event.pointerId);
        } catch (_) {}

        emitOperation({
            type: "stroke",
            x0: point.x,
            y0: point.y,
            x1: point.x,
            y1: point.y,
            color,
            size,
            tool: tool === "eraser" ? "eraser" : "pen"
        });
    }

    function continueDrawing(event) {
        if (!drawing || !lastPoint) return;
        event.preventDefault();

        const point = pointFromEvent(event);

        emitOperation({
            type: "stroke",
            x0: lastPoint.x,
            y0: lastPoint.y,
            x1: point.x,
            y1: point.y,
            color,
            size,
            tool: tool === "eraser" ? "eraser" : "pen"
        });

        lastPoint = point;
    }

    function stopDrawing() {
        drawing = false;
        lastPoint = null;
    }

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", startDrawing);
    canvas.addEventListener("pointermove", continueDrawing);
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
    canvas.addEventListener("lostpointercapture", stopDrawing);

    if (clearButton) {
        clearButton.addEventListener("click", event => {
            event.preventDefault();
            socket.emit("board-operation", { type: "clear" });
        });
    }

    socket.on("board-operation", receiveOperation);

    socket.on("board-history", history => {
        if (!Array.isArray(history)) return;
        operations = history;
        renderBoard();
    });

    socket.on("board-reset", () => {
        operations = [];
        background = "#fffef9";
        renderBoard();
    });

    socket.on("connect", () => {
        socket.emit("join-room", { roomId, username });
    });

    socket.on("room-joined", info => {
        if (info && info.roomId && roomIdLabel) {
            roomIdLabel.textContent = info.roomId;
        }
    });

    // Participants
    function renderParticipants(users) {
        if (!Array.isArray(users)) return;

        const list = $("participants");
        const count = $("participantCount");
        const online = $("onlineCount");

        if (list) {
            list.replaceChildren();

            users.forEach(user => {
                const li = document.createElement("li");
                li.className = "participant-item";

                const avatar = document.createElement("span");
                avatar.className = "avatar";
                avatar.textContent = (user.username || "G")[0].toUpperCase();

                const name = document.createElement("span");
                name.className = "participant-name";
                name.textContent = user.username || "Guest";

                li.append(avatar, name);
                list.appendChild(li);
            });
        }

        if (count) count.textContent = users.length;
        if (online) online.textContent = users.length;
    }

    socket.on("room-users", renderParticipants);
    socket.on("participants", renderParticipants);

    // Chat
    function appendMessage(data, system = false) {
        const messages = $("messages");
        if (!messages || !data) return;

        $("emptyChat")?.remove();

        const item = document.createElement("div");
        item.className = system ? "system-message" : "message";

        if (system) {
            item.textContent = data.message || "";
        } else {
            const author = document.createElement("strong");
            author.textContent = `${data.username || "Guest"}: `;

            const text = document.createElement("span");
            text.textContent = data.message || "";

            const time = document.createElement("small");
            const date = new Date(data.time || Date.now());
            time.textContent = ` ${date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })}`;

            item.append(author, text, time);
        }

        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    $("chatForm")?.addEventListener("submit", event => {
        event.preventDefault();

        const input = $("messageInput");
        const message = input?.value.trim();

        if (!message) return;

        socket.emit("chat-message", { message });
        input.value = "";
        input.focus();
    });

    socket.on("chat-message", data => appendMessage(data));
    socket.on("system-message", data => appendMessage(data, true));

    // Copy room ID
    copyRoomIdButton?.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(roomId);
            if (copyStatus) copyStatus.textContent = "Copied!";
        } catch (_) {
            if (copyStatus) copyStatus.textContent = roomId;
        }

        setTimeout(() => {
            if (copyStatus) copyStatus.textContent = "";
        }, 1500);
    });

    leaveRoomButton?.addEventListener("click", () => {
        if (!confirm("Are you sure you want to leave this room?")) return;

        localStorage.removeItem("roomId");
        socket.disconnect();
        location.replace("/");
    });

    updateSize();
    chooseColor(color);
    chooseTool("pen");
    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);

    if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(resizeCanvas).observe(canvas);
    }
})();
