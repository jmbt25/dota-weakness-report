/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0d12',
          panel: '#13161d',
          raised: '#1a1e27',
        },
        ink: {
          DEFAULT: '#e6e8ee',
          muted: '#9aa3b2',
          dim: '#6b7280',
        },
        accent: {
          DEFAULT: '#ef4444',
          good: '#22c55e',
          ok: '#f59e0b',
          bad: '#ef4444',
        },
        line: '#222632',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
