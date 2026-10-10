import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: '#F5F0E3',
        'on-surface': '#181816',
        'on-surface-variant': '#4E4B47',
        'surface-container-lowest': '#FFFFFF',
        'surface-container-low': '#FAF7F0',
        'surface-container': '#F1EBE0',
        'surface-container-high': '#E7DFCE',
        'surface-container-highest': '#D9CEB8',
        primary: '#0E4B3E',
        'primary-hover': '#0A382E',
        'primary-container': '#D7F4E5',
        'on-primary-container': '#0B382F',
        secondary: '#E05326',
        'secondary-container': '#FFEFEA',
        'on-secondary-container': '#962C0B',
        tertiary: '#15803D',
        'tertiary-container': '#DDF9E6',
        accent: '#FEF08A',
        warning: '#D97706',
        'warning-container': '#FEF3C7',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      fontFamily: {
        body: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'pop-xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'pop-sm': '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'pop-md': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        'pop-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.03)',
        'pop-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [],
}
export default config