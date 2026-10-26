import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', '.yarn/', '.pnp.*', '.cache/', '.obsidian/', '.claudian/', 'docs/']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  { languageOptions: { parserOptions: { projectService: true } } },
  { files: ['**/*.js', '**/*.cjs'], extends: [tseslint.configs.disableTypeChecked] },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
);
