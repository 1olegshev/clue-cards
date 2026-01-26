import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { GameProvider } from "@/components/GameContext";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Clue Cards",
  description: "A multiplayer word guessing party game",
};

// Inline script to prevent flash of wrong theme
const themeScript = `
  (function() {
    const stored = localStorage.getItem('cluecards-theme');
    let theme = stored;
    if (!theme || theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.add(theme);
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <GameProvider>
            <Navbar />
            {children}
          </GameProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
