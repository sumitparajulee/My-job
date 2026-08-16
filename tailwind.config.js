/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#FFFFFF', dim: '#F2F4F8' },
        ink: { DEFAULT: '#111827', soft: '#4B5563', faint: '#94A3B8' },
        night: { DEFAULT: '#0E1330', panel: '#161B45', line: '#2A3170' },
        brass: { DEFAULT: '#3652CC', soft: '#5B79FF', dim: '#233C99' },
        forest: { DEFAULT: '#166534', soft: '#4ade80' },
        brick: { DEFAULT: '#991b1b', soft: '#dc2626' },
        slate: { DEFAULT: '#6B7280' },
        accent: { DEFAULT: '#3652CC' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(54,82,204,0.06), 0 1px 1px rgba(54,82,204,0.04)',
        stamp: '0 2px 6px rgba(54,82,204,0.25)',
      },
    },
  },
  plugins: [],
}
