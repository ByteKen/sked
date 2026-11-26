import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: {
          light: '#F6F7FB',
          dark: '#090B10',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#10131C',
          elevated: '#171B27',
        },
        brand: {
          50: '#EEF3FF',
          100: '#DCE6FF',
          200: '#BFD2FF',
          300: '#93B4FF',
          400: '#648EFF',
          500: '#3B6BFF',
          600: '#2A55EB',
          700: '#1F43CC',
          800: '#1B36A3',
          900: '#192F80',
        },
      },
      boxShadow: {
        'surface-sm': '0 1px 2px 0 rgba(9, 11, 16, 0.05)',
        'surface-md': '0 8px 24px -6px rgba(9, 11, 16, 0.08), 0 2px 6px -2px rgba(9, 11, 16, 0.04)',
        'surface-lg': '0 20px 50px -12px rgba(9, 11, 16, 0.14), 0 4px 16px -4px rgba(9, 11, 16, 0.06)',
        'brand-glow': '0 0 0 1px rgba(59, 107, 255, 0.25), 0 8px 28px -4px rgba(59, 107, 255, 0.45)',
        'brand-glow-sm': '0 4px 16px -3px rgba(59, 107, 255, 0.35)',
        'dark-md': '0 8px 28px -6px rgba(0, 0, 0, 0.5)',
        'dark-lg': '0 24px 60px -12px rgba(0, 0, 0, 0.72)',
      },
    },
  },
  plugins: [forms],
};
