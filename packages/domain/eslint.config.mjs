import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'jest.config.js', 'src/generated', '*.config.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
