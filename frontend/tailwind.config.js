/** @type {import('tailwindcss').Config} */
// Only the base reset and utilities are used; colours, type and shadows come
// from the role tokens in brand-tokens.css and ThemeContext.
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        canvas: 'var(--canvas)',
        line: 'var(--line)',
        signal: 'var(--signal)',
        'on-signal': 'var(--on-signal)',
      },
      fontFamily: {
        sans: ['var(--font-app)'],
        display: ['var(--font-display)'],
        code: ['var(--font-code)'],
      },
      boxShadow: {
        rest: 'var(--shadow-rest)',
        float: 'var(--shadow-float)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
      },
    },
  },
  plugins: [],
};
