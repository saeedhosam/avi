/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        cockpit: "#050b14",
        surface: "#0b1424",
        line: "#1e3a4c",
        radar: "#22d3ee",
        "aero-blue": "#60a5fa",
        amber: "#fbbf24",
      },
    },
  },
};
