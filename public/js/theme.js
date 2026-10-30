(() => {
    "use strict";

    const STORAGE_KEY = "collabBoardDarkMode";

    const toggleButton = document.getElementById("themeToggle");

    if (!toggleButton) {
        return;
    }

    // Restore the previously selected theme.
    function getSavedTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY) === "true";
        } catch (error) {
            return false;
        }
    }

    // Apply the selected theme.
    function applyTheme(isDark) {

        document.body.classList.toggle("dark-mode", isDark);

        const label = isDark
            ? "Switch to light mode"
            : "Switch to dark mode";

        toggleButton.setAttribute("aria-label", label);
        toggleButton.setAttribute("title", label);
        toggleButton.setAttribute("aria-pressed", String(isDark));

        // Update browser theme colour on mobile.
        const themeColor = document.querySelector(
            'meta[name="theme-color"]'
        );

        if (themeColor) {
            themeColor.setAttribute(
                "content",
                isDark ? "#08132e" : "#c9b5f3"
            );
        }
    }

    // Apply saved theme immediately.
    applyTheme(getSavedTheme());

    // Toggle theme when the bulb is clicked.
    toggleButton.addEventListener("click", () => {

        const newDarkMode =
            !document.body.classList.contains("dark-mode");

        applyTheme(newDarkMode);

        try {
            localStorage.setItem(
                STORAGE_KEY,
                String(newDarkMode)
            );
        } catch (error) {
            console.warn("Unable to save theme preference.");
        }
    });

})();