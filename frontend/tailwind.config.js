/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        paper: 'var(--paper)',
        'paper-sunken': 'var(--paper-sunken)',
        line: 'var(--line)',
        'bg-primary': 'var(--bg-primary)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        card: 'var(--card-bg)',
        'border-primary': 'var(--border-primary)',
        'accent-primary': 'var(--accent-primary)',
        'accent-red': 'var(--accent-red)',
        'accent-blue': 'var(--accent-blue)',
        'accent-green': 'var(--accent-green)',
      },
      fontFamily: {
        sans: ['var(--font-app)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        'soft-md': 'var(--shadow-soft-md)',
      },
      borderRadius: {
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};
