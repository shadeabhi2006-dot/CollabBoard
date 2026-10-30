(() => {
    "use strict";

    const STORAGE_KEY = "collabBoardDarkMode";
    const toggleButton = document.getElementById("themeToggle");

    if (!toggleButton) return;

    function getSavedTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY) === "true";
        } catch (error) {
            return false;
        }
    }

    function applyTheme(isDark) {
        document.body.classList.toggle("dark-mode", isDark);

        const label = isDark
            ? "Switch to light mode"
            : "Switch to dark mode";

        toggleButton.setAttribute("aria-label", label);
        toggleButton.setAttribute("title", label);
        toggleButton.setAttribute("aria-pressed", String(isDark));

        const themeColor = document.querySelector(
            'meta[name="theme-color"]'
        );

        if (themeColor) {
            themeColor.setAttribute(
                "content",
                isDark ? "#10152f" : "#ded5ff"
            );
        }

        // Notify the drawing application to repaint its canvas.
        window.dispatchEvent(
            new CustomEvent("collabboard-theme-change", {
                detail: { darkMode: isDark }
            })
        );
    }

    // Restore saved theme.
    applyTheme(getSavedTheme());

    // Toggle theme.
    toggleButton.addEventListener("click", () => {
        const isDark = !document.body.classList.contains("dark-mode");

        applyTheme(isDark);

        try {
            localStorage.setItem(STORAGE_KEY, String(isDark));
        } catch (error) {
            console.warn("Unable to save theme preference.");
        }
    });

})();