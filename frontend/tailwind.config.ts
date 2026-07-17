import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e8eaf6',
          100: '#c5cae9',
          200: '#9fa8da',
          300: '#7986cb',
          400: '#5c6bc0',
          500: '#3f51b5',
          600: '#3949ab',
          700: '#303f9f',
          800: '#283593',
          900: '#1a237e',
          950: '#0d1149',
        },
        secondary: {
          50:  '#fff8e1',
          100: '#ffecb3',
          200: '#ffe082',
          300: '#ffd54f',
          400: '#ffca28',
          500: '#ffc107',
          600: '#ffb300',
          700: '#ffa000',
          800: '#ff8f00',
          900: '#ff6f00',
        },
        danger: {
          50:  '#ffebee',
          100: '#ffcdd2',
          500: '#f44336',
          600: '#e53935',
          700: '#d32f2f',
        },
        success: {
          50:  '#e8f5e9',
          100: '#c8e6c9',
          500: '#4caf50',
          600: '#43a047',
          700: '#388e3c',
        },
        neutral: {
          50:  '#fafafa',
          100: '#f5f5f5',
          200: '#eeeeee',
          300: '#e0e0e0',
          400: '#bdbdbd',
          500: '#9e9e9e',
          600: '#757575',
          700: '#616161',
          800: '#424242',
          900: '#212121',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        'card-hover': '0 4px 6px rgba(0,0,0,0.16), 0 2px 4px rgba(0,0,0,0.12)',
        'elevated': '0 10px 20px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
