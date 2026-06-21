/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/mainview/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        elevated: "hsl(var(--elevated))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        recording: {
          DEFAULT: "hsl(var(--recording))",
          foreground: "hsl(var(--recording-foreground))",
        },
        playback: {
          DEFAULT: "hsl(var(--playback))",
          foreground: "hsl(var(--playback-foreground))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        card: "0 1px 2px 0 hsl(0 0% 0% / 0.3), 0 1px 1px 0 hsl(0 0% 0% / 0.2)",
        "card-hover":
          "0 8px 24px -6px hsl(0 0% 0% / 0.5), 0 2px 6px -2px hsl(0 0% 0% / 0.4)",
        "glow-recording": "0 0 0 1px hsl(var(--recording) / 0.5), 0 8px 36px -4px hsl(var(--recording) / 0.55)",
        "glow-playback": "0 0 0 1px hsl(var(--playback) / 0.4), 0 6px 24px -6px hsl(var(--playback) / 0.5)",
      },
      backgroundImage: {
        /* 録音ステージの背景。中央に向けてうっすら光が集まる演出。 */
        "stage-idle":
          "radial-gradient(120% 90% at 50% 38%, hsl(220 26% 13% / 0.9) 0%, hsl(var(--background)) 62%)",
        "stage-live":
          "radial-gradient(120% 90% at 50% 38%, hsl(0 60% 16% / 0.55) 0%, hsl(var(--background)) 60%)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "live-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "live-dot": "live-dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
