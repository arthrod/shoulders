/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--bg-tertiary) / <alpha-value>)',
          hover: 'rgb(var(--bg-hover) / <alpha-value>)',
          backdrop: 'rgb(var(--bg-canvas) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--fg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--fg-secondary) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          secondary: 'rgb(var(--accent-secondary) / <alpha-value>)',
        },
        canvas: {
          yellow: 'rgb(var(--canvas-yellow) / <alpha-value>)',
          blue: 'rgb(var(--canvas-blue) / <alpha-value>)',
          green: 'rgb(var(--canvas-green) / <alpha-value>)',
          pink: 'rgb(var(--canvas-pink) / <alpha-value>)',
          purple: 'rgb(var(--canvas-purple) / <alpha-value>)',
          orange: 'rgb(var(--canvas-orange) / <alpha-value>)',
          gray: 'rgb(var(--canvas-gray) / <alpha-value>)',
        },
        line: 'rgb(var(--border) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        error: 'rgb(var(--error) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      borderColor: {
        DEFAULT: 'rgb(var(--border) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
