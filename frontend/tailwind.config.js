/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0f0f0f',
        cardBg: '#1a1a1a',
        tradeGreen: '#00ff88',
        tradeRed: '#ff4444',
      }
    },
  },
  plugins: [],
}
