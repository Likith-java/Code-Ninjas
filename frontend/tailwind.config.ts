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
        body: ['Hanken Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'pop-xs': '1.5px 1.5px 0px #181816',
        'pop-sm': '2.5px 2.5px 0px #181816',
        'pop-md': '3.5px 3.5px 0px #181816',
        'pop-lg': '5px 5px 0px #181816',
        'pop-xl': '6px 6px 0px #181816',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(#CFBE9F 1.4px, transparent 1.4px)',
      },
      backgroundSize: {
        'dot-grid': '18px 18px',
      },
    },
  },
  plugins: [],
}
export default config