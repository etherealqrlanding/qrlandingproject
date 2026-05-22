/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta tentativa — Tango Buenos Aires
        ink: {
          DEFAULT: '#0d0a0a',
          soft: '#1a1414',
        },
        bordeaux: {
          DEFAULT: '#6b1a2a',
          deep: '#4a0f1d',
          light: '#8c2438',
        },
        gold: {
          DEFAULT: '#c8a85a',
          soft: '#e0c787',
          deep: '#a08540',
        },
        cream: '#f5efe6',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
