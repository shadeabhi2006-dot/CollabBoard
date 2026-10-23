(() => {
    const usernameInput = document.getElementById("username");
    const roomInput = document.getElementById("roomId");
    const error = document.getElementById("formError");

    document.getElementById("year").textContent =
        new Date().getFullYear();

    function getUsername() {
        const username = usernameInput.value.trim();

        if (!username) {
            error.textContent = "Please enter your username first.";
            usernameInput.focus();
            return "";
        }

        if (username.length > 24) {
            error.textContent =
                "Your username must be 24 characters or fewer.";

            usernameInput.focus();
            return "";
        }

        localStorage.setItem("username", username);

        error.textContent = "";

        return username;
    }

    function openRoom(roomId) {
        localStorage.setItem("roomId", roomId);

        window.location.href = "/room.html";
    }

    // Create a new room
    document
        .getElementById("createRoom")
        .addEventListener("click", () => {

            if (!getUsername()) {
                return;
            }

            const roomId =
                "CB-" +
                Math.random()
                    .toString(36)
                    .slice(2, 8)
                    .toUpperCase();

            openRoom(roomId);
        });

    // Join an existing room
    document
        .getElementById("identityForm")
        .addEventListener("submit", event => {

            event.preventDefault();

            if (!getUsername()) {
                return;
            }

            const roomId = roomInput.value.trim();

            if (!roomId) {
                error.textContent =
                    "Enter a Room ID to join, or choose Create Room.";

                roomInput.focus();

                return;
            }

            openRoom(roomId);
        });

    // Sign In navigation
    document
        .getElementById("signInLink")
        .addEventListener("click", event => {

            event.preventDefault();

            usernameInput.focus();

            document
                .getElementById("signin")
                .scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
        });

    // Restore the last username
    const savedName = localStorage.getItem("username");

    if (savedName) {
        usernameInput.value = savedName;
    }
})();