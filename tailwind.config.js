/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        app: 'var(--bg-app)',
        card: 'var(--bg-card)',
        'card-hover': 'var(--bg-card-hover)',
        toolbar: 'var(--bg-toolbar)',
        elevated: 'var(--bg-elevated)',
        input: 'var(--bg-input)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
      },
    },
  },
  plugins: [],
};
