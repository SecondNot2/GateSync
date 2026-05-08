import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        primary: 'hsl(var(--primary))',
        accent: 'hsl(var(--accent))',
        'status-pending': 'hsl(var(--color-status-pending))',
        'status-active': 'hsl(var(--color-status-active))',
        'status-done': 'hsl(var(--color-status-done))',
        'status-alert': 'hsl(var(--color-status-alert))'
      },
      spacing: {
        touch: 'var(--spacing-touch)'
      },
      fontSize: {
        plate: ['var(--font-size-plate)', { letterSpacing: '0.12em', fontWeight: '700' }]
      },
      boxShadow: {
        soft: '0 24px 80px rgb(15 23 42 / 0.12)'
      }
    }
  },
  plugins: []
};

export default config;
