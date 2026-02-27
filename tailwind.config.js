/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/mainview/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        recording: {
          red: "#ef4444",
          "red-dark": "#dc2626",
        },
      },
      animation: {
        pulse: "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
