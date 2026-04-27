/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#07080d',
          deep: '#0b0d14',
          panel: '#12151f',
          raised: '#1a1e2b',
          elevated: '#232838',
        },
        ink: {
          DEFAULT: '#ECE6D6',
          soft: '#C9C2B0',
          muted: '#8A8474',
          dim: '#5C5749',
        },
        accent: {
          DEFAULT: '#E94560',
          hover: '#FF5872',
          dim: '#B7344B',
          good: '#4ADE80',
          ok: '#F5B142',
          bad: '#E94560',
        },
        cosmic: {
          violet: '#5B3A8F',
          indigo: '#2A2456',
          haze: '#6E4FB8',
        },
        line: {
          DEFAULT: '#2A2E3D',
          strong: '#3A3F52',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bebas Neue"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
