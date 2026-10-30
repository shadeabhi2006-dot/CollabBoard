
(() => {
    "use strict";

    // --------------------------------------------------
    // HTML ELEMENTS
    // --------------------------------------------------

    const $ = id => document.getElementById(id);

    const canvas = $("drawingCanvas");

    if (!canvas) {
        console.error("CollabBoard: drawingCanvas not found.");
        return;
    }

    const ctx = canvas.getContext("2d", {
        willReadFrequently: true
    });

    const colorPicker = $("colorPicker");
    const brushSize = $("brushSize");
    const brushSizeValue = $("brushSizeValue");

    const fillButton = $("fillBoard");
    const clearButton = $("clearBoard");

    const roomIdLabel = $("roomIdLabel");
    const copyRoomIdButton = $("copyRoomId");
    const copyStatus = $("copyStatus");

    const leaveRoomButton = $("leaveRoom");

    const participantsList = $("participants");
    const participantCount = $("participantCount");
    const onlineCount = $("onlineCount");

    const chatForm = $("chatForm");
    const messageInput = $("messageInput");
    const messagesContainer = $("messages");
    const emptyChat = $("emptyChat");

    const yearElement = $("year");

    // --------------------------------------------------
    // ROOM INFORMATION
    // --------------------------------------------------

    const params = new URLSearchParams(window.location.search);

    // Only accept room ID from the current URL.
    // Never reuse an old room ID from localStorage.
    const roomId = params.get("room") || "";

    const username = (
        params.get("username") ||
        localStorage.getItem("username") ||
        "Guest"
    ).trim().slice(0, 24) || "Guest";

    if (!roomId.trim()) {
        localStorage.removeItem("roomId");

        alert("No Room ID found. Please create or join a room.");

        window.location.replace("/");
        return;
    }

    localStorage.setItem("username", username);

    if (roomIdLabel) {
        roomIdLabel.textContent = roomId;
    }

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    // --------------------------------------------------
    // SOCKET.IO CONNECTION
    // --------------------------------------------------

    if (typeof window.io !== "function") {
        alert("Socket.IO failed to load. Please refresh the page.");
        return;
    }

    const socket = window.io(
        "https://collabboard-633k.onrender.com",
        {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: Infinity
        }
    );

    let joinedRoom = false;
    let leavingRoom = false;

    // --------------------------------------------------
    // DRAWING VARIABLES
    // --------------------------------------------------

    let tool = "pen";

    let color = colorPicker?.value || "#315b87";

    let size = Number(brushSize?.value || 5);

    let drawing = false;
    let lastPoint = null;
    let movedDuringStroke = false;

    let operations = [];

    // Operations drawn locally but not yet confirmed by
    // the server. This prevents duplicate drawing on echo.
    let pendingOperations = [];

    let cssWidth = 0;
    let cssHeight = 0;
    let pixelRatio = 1;

    // --------------------------------------------------
    // CANVAS BACKGROUND
    // --------------------------------------------------

    function getBackgroundColor() {
        return document.body.classList.contains("dark-mode")
            ? "#000000"
            : "#fffef9";
    }

    function validColor(value) {
        return (
            typeof value === "string" &&
            /^#[0-9a-fA-F]{6}$/.test(value)
        );
    }

    function fillCanvasBackground() {
        ctx.save();

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = getBackgroundColor();

        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.restore();
    }

    // --------------------------------------------------
    // CANVAS RESIZING
    // --------------------------------------------------

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();

        if (!rect.width || !rect.height) return;

        cssWidth = rect.width;
        cssHeight = rect.height;

        pixelRatio = Math.min(
            window.devicePixelRatio || 1,
            2
        );

        const newWidth = Math.max(
            1,
            Math.round(cssWidth * pixelRatio)
        );

        const newHeight = Math.max(
            1,
            Math.round(cssHeight * pixelRatio)
        );

        if (
            canvas.width === newWidth &&
            canvas.height === newHeight
        ) {
            return;
        }

        canvas.width = newWidth;
        canvas.height = newHeight;

        renderBoard();
    }

    // --------------------------------------------------
    // POINTER COORDINATES
    // --------------------------------------------------

    function pointFromEvent(event) {
        const rect = canvas.getBoundingClientRect();

        return {
            x: Math.max(
                0,
                Math.min(1, (event.clientX - rect.left) / rect.width)
            ),

            y: Math.max(
                0,
                Math.min(1, (event.clientY - rect.top) / rect.height)
            )
        };
    }

    // --------------------------------------------------
    // DRAW STROKE
    // --------------------------------------------------

    function paintStroke(operation) {
        if (
            !Number.isFinite(operation.x0) ||
            !Number.isFinite(operation.y0) ||
            !Number.isFinite(operation.x1) ||
            !Number.isFinite(operation.y1)
        ) {
            return;
        }

        ctx.save();

        ctx.globalCompositeOperation = "source-over";

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.lineWidth = Math.max(
            1,
            Number(operation.size || 5) * pixelRatio
        );

        if (operation.tool === "eraser") {
            ctx.strokeStyle = getBackgroundColor();
        } else {
            if (!validColor(operation.color)) {
                ctx.restore();
                return;
            }

            ctx.strokeStyle = operation.color;
        }

        ctx.beginPath();

        ctx.moveTo(
            operation.x0 * canvas.width,
            operation.y0 * canvas.height
        );

        ctx.lineTo(
            operation.x1 * canvas.width,
            operation.y1 * canvas.height
        );

        ctx.stroke();

        ctx.restore();
    }

    // --------------------------------------------------
    // BUCKET FILL
    // --------------------------------------------------

    function paintBucket(operation) {
        if (!validColor(operation.color)) return;

        const width = canvas.width;
        const height = canvas.height;

        if (!width || !height) return;

        const startX = Math.max(
            0,
            Math.min(width - 1, Math.round(operation.x * width))
        );

        const startY = Math.max(
            0,
            Math.min(height - 1, Math.round(operation.y * height))
        );

        const imageData = ctx.getImageData(
            0,
            0,
            width,
            height
        );

        const data = imageData.data;

        const startIndex = (startY * width + startX) * 4;

        const targetR = data[startIndex];
        const targetG = data[startIndex + 1];
        const targetB = data[startIndex + 2];
        const targetA = data[startIndex + 3];

        const fillR = parseInt(operation.color.slice(1, 3), 16);
        const fillG = parseInt(operation.color.slice(3, 5), 16);
        const fillB = parseInt(operation.color.slice(5, 7), 16);

        if (
            targetR === fillR &&
            targetG === fillG &&
            targetB === fillB &&
            targetA === 255
        ) {
            return;
        }

        const tolerance = 24;

        function matches(index) {
            return (
                Math.abs(data[index] - targetR) <= tolerance &&
                Math.abs(data[index + 1] - targetG) <= tolerance &&
                Math.abs(data[index + 2] - targetB) <= tolerance &&
                Math.abs(data[index + 3] - targetA) <= tolerance
            );
        }

        // A pixel is marked when added to the stack,
        // preventing it from being added repeatedly.
        const visited = new Uint8Array(width * height);

        const stack = new Int32Array(width * height);

        let top = 0;

        const startPixel = startY * width + startX;

        stack[top++] = startPixel;
        visited[startPixel] = 1;

        while (top > 0) {
            const pixel = stack[--top];

            const index = pixel * 4;

            if (!matches(index)) continue;

            data[index] = fillR;
            data[index + 1] = fillG;
            data[index + 2] = fillB;
            data[index + 3] = 255;

            const x = pixel % width;
            const y = Math.floor(pixel / width);

            function addNeighbour(nextPixel) {
                if (visited[nextPixel]) return;

                const nextIndex = nextPixel * 4;

                if (!matches(nextIndex)) return;

                visited[nextPixel] = 1;
                stack[top++] = nextPixel;
            }

            if (x > 0) {
                addNeighbour(pixel - 1);
            }

            if (x < width - 1) {
                addNeighbour(pixel + 1);
            }

            if (y > 0) {
                addNeighbour(pixel - width);
            }

            if (y < height - 1) {
                addNeighbour(pixel + width);
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // --------------------------------------------------
    // APPLY OPERATION
    // --------------------------------------------------

    function applyOperation(operation) {
        if (!operation || typeof operation !== "object") return;

        if (operation.type === "stroke") {
            paintStroke(operation);
        }

        else if (operation.type === "bucket-fill") {
            paintBucket(operation);
        }

        else if (operation.type === "clear") {
            fillCanvasBackground();
        }
    }

    // --------------------------------------------------
    // RENDER BOARD HISTORY
    // --------------------------------------------------

    function renderBoard() {
        fillCanvasBackground();

        for (const operation of operations) {
            applyOperation(operation);
        }
    }

    // --------------------------------------------------
    // LOCAL OPERATION + SERVER SYNC
    // --------------------------------------------------

    function operationSignature(operation) {
        return JSON.stringify(operation);
    }

    function sendOperation(operation) {
        operations.push(operation);

        pendingOperations.push(
            operationSignature(operation)
        );

        applyOperation(operation);

        socket.emit("board-operation", operation);
    }

    function receiveOperation(operation) {
        if (!operation || typeof operation !== "object") return;

        const signature = operationSignature(operation);

        const pendingIndex = pendingOperations.indexOf(signature);

        // The server broadcasts operations to the sender too.
        // Ignore our own already-rendered operation.
        if (pendingIndex !== -1) {
            pendingOperations.splice(pendingIndex, 1);
            return;
        }

        operations.push(operation);

        applyOperation(operation);
    }

    // --------------------------------------------------
    // TOOL SELECTION
    // --------------------------------------------------

    function chooseTool(selectedTool) {
        tool = selectedTool;

        document.querySelectorAll("[data-tool]").forEach(button => {
            const active = button.dataset.tool === selectedTool;

            button.classList.toggle("active", active);

            button.setAttribute(
                "aria-pressed",
                active ? "true" : "false"
            );
        });

        canvas.style.cursor =
            selectedTool === "fill" ? "crosshair" : "crosshair";
    }

    document.querySelectorAll("[data-tool]").forEach(button => {
        button.addEventListener("click", () => {
            chooseTool(button.dataset.tool);
        });
    });

    // --------------------------------------------------
    // COLOUR SELECTION
    // --------------------------------------------------

    function chooseColor(newColor) {
        if (!validColor(newColor)) return;

        color = newColor;

        if (colorPicker) {
            colorPicker.value = newColor;
        }
    }

    if (colorPicker) {
        colorPicker.addEventListener("input", () => {
            chooseColor(colorPicker.value);
        });
    }

    document.querySelectorAll("[data-color]").forEach(button => {
        button.addEventListener("click", () => {
            chooseColor(button.dataset.color);
        });
    });

    // --------------------------------------------------
    // BRUSH SIZE
    // --------------------------------------------------

    function updateSize() {
        if (!brushSize) return;

        size = Number(brushSize.value);

        if (brushSizeValue) {
            brushSizeValue.textContent = String(size);
        }
    }

    if (brushSize) {
        brushSize.addEventListener("input", updateSize);
    }

    // --------------------------------------------------
    // POINTER DRAWING
    // --------------------------------------------------

    canvas.addEventListener("pointerdown", event => {
        event.preventDefault();

        if (leavingRoom) return;

        const point = pointFromEvent(event);

        if (tool === "fill") {
            sendOperation({
                type: "bucket-fill",
                x: point.x,
                y: point.y,
                color
            });

            return;
        }

        drawing = true;
        movedDuringStroke = false;
        lastPoint = point;

        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", event => {
        if (!drawing || !lastPoint) return;

        event.preventDefault();

        const point = pointFromEvent(event);

        const operation = {
            type: "stroke",

            x0: lastPoint.x,
            y0: lastPoint.y,

            x1: point.x,
            y1: point.y,

            color,
            size,

            tool: tool === "eraser" ? "eraser" : "pen"
        };

        sendOperation(operation);

        lastPoint = point;
        movedDuringStroke = true;
    });

    function finishDrawing(event) {
        if (!drawing || !lastPoint) return;

        if (!movedDuringStroke) {
            const operation = {
                type: "stroke",

                x0: lastPoint.x,
                y0: lastPoint.y,

                x1: lastPoint.x,
                y1: lastPoint.y,

                color,
                size,

                tool: tool === "eraser" ? "eraser" : "pen"
            };

            sendOperation(operation);
        }

        drawing = false;
        lastPoint = null;
        movedDuringStroke = false;

        if (
            event &&
            canvas.hasPointerCapture(event.pointerId)
        ) {
            canvas.releasePointerCapture(event.pointerId);
        }
    }

    canvas.addEventListener("pointerup", finishDrawing);
    canvas.addEventListener("pointercancel", finishDrawing);

    canvas.addEventListener("contextmenu", event => {
        event.preventDefault();
    });

    // --------------------------------------------------
    // CLEAR BOARD
    // --------------------------------------------------

    if (clearButton) {
        clearButton.addEventListener("click", () => {
            sendOperation({
                type: "clear"
            });
        });
    }

    // --------------------------------------------------
    // SOCKET EVENTS
    // --------------------------------------------------

    socket.on("connect", () => {
        if (leavingRoom) return;

        joinedRoom = false;

        socket.emit("join-room", {
            roomId,
            username
        });
    });

    socket.on("room-joined", data => {
        joinedRoom = true;

        if (data && data.roomId && roomIdLabel) {
            roomIdLabel.textContent = data.roomId;
        }
    });

    socket.on("room-error", message => {
        alert(
            typeof message === "string"
                ? message
                : "Unable to join this room."
        );

        socket.disconnect();

        window.location.replace("/");
    });

    socket.on("board-history", history => {
        if (!Array.isArray(history)) return;

        operations = history;
        pendingOperations = [];

        renderBoard();
    });

    socket.on("board-operation", operation => {
        receiveOperation(operation);
    });

    socket.on("board-reset", () => {
        operations = [];
        pendingOperations = [];

        renderBoard();
    });

    socket.on("connect_error", error => {
        console.error("CollabBoard connection error:", error.message);
    });

    // --------------------------------------------------
    // PARTICIPANTS
    // --------------------------------------------------

    function renderParticipants(users) {
        if (!Array.isArray(users)) return;

        if (participantsList) {
            participantsList.innerHTML = "";

            users.forEach(user => {
                const item = document.createElement("li");
                item.className = "participant-item";

                const avatar = document.createElement("span");
                avatar.className = "avatar";

                avatar.textContent = (
                    user.username || "G"
                ).charAt(0).toUpperCase();

                const name = document.createElement("span");
                name.className = "participant-name";
                name.textContent = user.username || "Guest";

                item.appendChild(avatar);
                item.appendChild(name);

                if (user.id === socket.id) {
                    const tag = document.createElement("span");
                    tag.className = "you-tag";
                    tag.textContent = "YOU";

                    item.appendChild(tag);
                }

                participantsList.appendChild(item);
            });
        }

        if (participantCount) {
            participantCount.textContent = users.length;
        }

        if (onlineCount) {
            onlineCount.textContent = users.length;
        }
    }

    socket.on("room-users", renderParticipants);
    socket.on("participants", renderParticipants);

    // --------------------------------------------------
    // CHAT
    // --------------------------------------------------

    function formatTime(value) {
        const date = value ? new Date(value) : new Date();

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function addChatMessage(data, isSystem = false) {
        if (!messagesContainer) return;

        if (emptyChat) {
            emptyChat.style.display = "none";
        }

        const messageElement = document.createElement("div");

        messageElement.className = isSystem
            ? "system-message-item"
            : "chat-message-item";

        if (isSystem) {
            const messageText = document.createElement("span");

            messageText.textContent = data.message || "";

            messageElement.appendChild(messageText);
        } else {
            const heading = document.createElement("div");
            heading.className = "chat-message-heading";

            const sender = document.createElement("strong");
            sender.textContent = data.username || "Guest";

            const time = document.createElement("small");
            time.textContent = formatTime(data.time);

            heading.appendChild(sender);
            heading.appendChild(time);

            const messageText = document.createElement("p");
            messageText.textContent = data.message || "";

            messageElement.appendChild(heading);
            messageElement.appendChild(messageText);
        }

        messagesContainer.appendChild(messageElement);

        messagesContainer.scrollTop =
            messagesContainer.scrollHeight;
    }

    if (chatForm) {
        chatForm.addEventListener("submit", event => {
            event.preventDefault();

            const message = messageInput.value.trim();

            if (!message || leavingRoom) return;

            socket.emit("chat-message", {
                message
            });

            messageInput.value = "";
            messageInput.focus();
        });
    }

    socket.on("chat-message", data => {
        addChatMessage(data, false);
    });

    socket.on("system-message", data => {
        addChatMessage(data, true);
    });

    // --------------------------------------------------
    // COPY ROOM ID
    // --------------------------------------------------

    if (copyRoomIdButton) {
        copyRoomIdButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(roomId);

                if (copyStatus) {
                    copyStatus.textContent = "Copied!";

                    setTimeout(() => {
                        copyStatus.textContent = "";
                    }, 1800);
                }
            } catch (error) {
                const temporaryInput = document.createElement("input");

                temporaryInput.value = roomId;

                document.body.appendChild(temporaryInput);

                temporaryInput.select();

                document.execCommand("copy");

                temporaryInput.remove();

                if (copyStatus) {
                    copyStatus.textContent = "Copied!";

                    setTimeout(() => {
                        copyStatus.textContent = "";
                    }, 1800);
                }
            }
        });
    }

    // --------------------------------------------------
    // LEAVE ROOM
    // --------------------------------------------------

    if (leaveRoomButton) {
        // LEAVE ROOM
leaveRoomButton.addEventListener("click", () => {

    // Disconnect from the room
    if (socket) {
        socket.disconnect();
    }

    // Remove previously stored room information
    localStorage.removeItem("roomId");
    sessionStorage.removeItem("roomId");

    // Preserve the username for the next visit
    // Redirect to the login page
    window.location.replace("/");
});
    }

    // --------------------------------------------------
    // THEME CHANGE SUPPORT
    // --------------------------------------------------

    const themeObserver = new MutationObserver(() => {
        renderBoard();
    });

    themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"]
    });

    // --------------------------------------------------
    // INITIAL SETUP
    // --------------------------------------------------

    updateSize();

    chooseColor(color);

    chooseTool("pen");

    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);

    if (typeof ResizeObserver !== "undefined") {
        const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
        });

        resizeObserver.observe(canvas.parentElement);
    }

})();
