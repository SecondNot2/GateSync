import nextPlugin from '@next/eslint-plugin-next';
import rootConfig from '../../eslint.config.mjs';

export default [
  ...rootConfig,
  {
    files: ['src/**/*.{ts,tsx}', 'next.config.ts', 'tailwind.config.ts'],
    plugins: {
      '@next/next': nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules
    },
    settings: {
      next: {
        rootDir: '.'
      }
    }
  }
];
