(() => {
    "use strict";

    const usernameInput =
        document.getElementById("usernameInput") ||
        document.getElementById("username") ||
        document.querySelector('input[placeholder*="username" i]');

    const roomIdInput =
        document.getElementById("roomIdInput") ||
        document.getElementById("roomId") ||
        document.querySelector('input[placeholder*="room id" i]');

    const allButtons = Array.from(document.querySelectorAll("button"));

    const createButton =
        document.getElementById("createRoom") ||
        document.getElementById("createRoomBtn") ||
        allButtons.find(button =>
            /create\s*(a\s*)?room/i.test(button.textContent)
        );

    const joinButton =
        document.getElementById("joinRoom") ||
        document.getElementById("joinRoomBtn") ||
        document.getElementById("enterRoom") ||
        allButtons.find(button =>
            /join\s*room|enter\s*room/i.test(button.textContent)
        );

    function generateRoomId() {
        const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

        const randomValues = new Uint32Array(8);
        crypto.getRandomValues(randomValues);

        let id = "";

        for (let i = 0; i < 8; i++) {
            id += characters[randomValues[i] % characters.length];
        }

        return id;
    }

    function getUsername() {
        const username = usernameInput
            ? usernameInput.value.trim()
            : "";

        if (!username) {
            alert("Please enter your username.");

            if (usernameInput) {
                usernameInput.focus();
            }

            return null;
        }

        if (username.length > 30) {
            alert("Your username must be 30 characters or fewer.");
            return null;
        }

        return username;
    }

    function enterRoom(roomId, username) {
        if (!roomId || !username) return;

        localStorage.setItem("username", username);
        localStorage.setItem("roomId", roomId);

        const params = new URLSearchParams({
            room: roomId,
            username
        });

        window.location.href = `/room.html?${params.toString()}`;
    }

    // CREATE ROOM
    if (createButton) {
        createButton.addEventListener("click", event => {
            event.preventDefault();

            const username = getUsername();

            if (!username) return;

            // Generate a new ID automatically.
            const roomId = generateRoomId();

            enterRoom(roomId, username);
        });
    }

    // JOIN ROOM
    if (joinButton) {
        joinButton.addEventListener("click", event => {
            event.preventDefault();

            const username = getUsername();

            if (!username) return;

            const roomId = roomIdInput
                ? roomIdInput.value.trim()
                : "";

            if (!roomId) {
                alert("Please enter the Room ID you want to join.");

                if (roomIdInput) {
                    roomIdInput.focus();
                }

                return;
            }

            enterRoom(roomId, username);
        });
    }

    // Press Enter in the Room ID field to join.
    if (roomIdInput) {
        roomIdInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();

                if (joinButton) {
                    joinButton.click();
                }
            }
        });
    }

    // Restore the previous username.
    if (usernameInput && !usernameInput.value) {
        usernameInput.value =
            localStorage.getItem("username") || "";
    }
})();