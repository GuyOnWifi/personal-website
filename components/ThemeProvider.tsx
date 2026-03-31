"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "sunlight" | "moonlight" | "starlight" | "twilight" | "sunrise" | "sunset";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themes: Theme[] = ["sunlight", "moonlight", "starlight", "twilight", "sunrise", "sunset"];

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>("moonlight");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const savedTheme = localStorage.getItem("theme") as Theme;
        if (savedTheme && themes.includes(savedTheme)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setThemeState(savedTheme);
            document.documentElement.setAttribute("data-theme", savedTheme);
        }
        setMounted(true);
    }, []);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem("theme", newTheme);
        document.documentElement.setAttribute("data-theme", newTheme);
    };

    const toggleTheme = () => {
        const currentIndex = themes.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        setTheme(themes[nextIndex]);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {!mounted ? (
                <div style={{ visibility: 'hidden' }}>{children}</div>
            ) : (
                children
            )}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};
