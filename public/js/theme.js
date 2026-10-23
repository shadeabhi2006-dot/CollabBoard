(() => {
    "use strict";

    const STORAGE_KEY = "collabBoardDarkMode";

    const toggleButton = document.getElementById("themeToggle");

    if (!toggleButton) {
        return;
    }

    /*
     * Restore the saved theme.
     *
     * The same localStorage key is used by the login page
     * and the room page.
     */

    function getSavedTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY) === "true";
        } catch (error) {
            return false;
        }
    }

    function applyTheme(isDark) {
        document.body.classList.toggle("dark-mode", isDark);

        toggleButton.setAttribute(
            "aria-label",
            isDark ? "Switch to light mode" : "Switch to dark mode"
        );

        toggleButton.setAttribute(
            "title",
            isDark ? "Switch to light mode" : "Switch to dark mode"
        );

        toggleButton.setAttribute(
            "aria-pressed",
            isDark ? "true" : "false"
        );
    }

    /*
     * Apply the saved theme immediately.
     */

    applyTheme(getSavedTheme());

    /*
     * Toggle the theme when the button is clicked.
     */

    toggleButton.addEventListener("click", () => {
        const currentlyDark =
            document.body.classList.contains("dark-mode");

        const newDarkMode = !currentlyDark;

        applyTheme(newDarkMode);

        try {
            localStorage.setItem(
                STORAGE_KEY,
                newDarkMode ? "true" : "false"
            );
        } catch (error) {
            console.warn("Unable to save theme preference.");
        }
    });

})();