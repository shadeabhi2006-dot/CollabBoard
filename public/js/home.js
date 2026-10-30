
document.addEventListener("DOMContentLoaded", () => {
    const usernameInput = document.getElementById("username");
    const roomIdInput = document.getElementById("roomId");

    const identityForm = document.getElementById("identityForm");
    const createRoomButton = document.getElementById("createRoom");
    const joinRoomButton = document.getElementById("joinRoom");

    const formError = document.getElementById("formError");
    const yearElement = document.getElementById("year");

    // Display current year
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    // Restore the previously saved username
    const savedUsername = localStorage.getItem("username");

    if (savedUsername) {
        usernameInput.value = savedUsername;
    }

    // Show an error message
    function showError(message) {
        if (formError) {
            formError.textContent = message;
            formError.style.display = "block";
        } else {
            alert(message);
        }
    }

    // Clear error message
    function clearError() {
        if (formError) {
            formError.textContent = "";
            formError.style.display = "none";
        }
    }

    // Validate and save username
    function getUsername() {
        const username = usernameInput.value.trim();

        if (!username) {
            showError("Please enter your username.");
            usernameInput.focus();
            return null;
        }

        if (username.length > 24) {
            showError("Username cannot exceed 24 characters.");
            usernameInput.focus();
            return null;
        }

        localStorage.setItem("username", username);
        clearError();

        return username;
    }

    // Open a room using its ID
    function openRoom(roomId, username) {
        const roomURL = new URL("/room.html", window.location.origin);

        roomURL.searchParams.set("room", roomId);
        roomURL.searchParams.set("username", username);

        window.location.assign(roomURL.toString());
    }

    // CREATE ROOM
    createRoomButton.addEventListener("click", () => {
        const username = getUsername();

        if (!username) return;

        // Generate a fresh room ID
        const randomPart = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();

        const roomId = "CB-" + randomPart;

        openRoom(roomId, username);
    });

    // JOIN ROOM
    function joinRoom() {
        const username = getUsername();

        if (!username) return;

        const roomId = roomIdInput.value.trim();

        if (!roomId) {
            showError("Please enter a Room ID.");
            roomIdInput.focus();
            return;
        }

        openRoom(roomId, username);
    }

    // Join button is a submit button in index.html
    identityForm.addEventListener("submit", (event) => {
        event.preventDefault();
        joinRoom();
    });
});
