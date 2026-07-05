/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta — Tangos & Milongas Tickets · Buenos Aires
        // Base oscura + dorado protagonista, con azul marino y rojo terracota de marca.
        ink: {
          DEFAULT: '#0d0a0a',
          soft: '#1a1414',
        },
        // Rojo terracota de la marca (antes bordó). Se conserva el nombre del token
        // para no tocar sus ~79 usos; ahora tira al rojo del logo.
        bordeaux: {
          DEFAULT: '#b23a2e',
          deep: '#7f2015',
          light: '#c9503f',
        },
        // Azul marino de la marca (nuevo acento secundario).
        navy: {
          DEFAULT: '#3a4d73',
          deep: '#26324d',
          light: '#5a6d94',
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
