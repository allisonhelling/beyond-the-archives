import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
import refresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['**/dist/**', 'node_modules', 'playwright-report', 'test-results', 'supabase/functions'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ['extension/**/*.js'], languageOptions: { globals: { chrome: 'readonly', __APP_ORIGIN__: 'readonly', __SUPABASE_URL__: 'readonly', __SUPABASE_KEY__: 'readonly' } } },
  { files: ['userscript/**/*.js'], languageOptions: { globals: { GM: 'readonly', __APP_ORIGIN__: 'readonly', __SUPABASE_URL__: 'readonly', __SUPABASE_KEY__: 'readonly', __SCRIPT_VERSION__: 'readonly', __BRAND_ICON__: 'readonly' } } },
  { files: ['src/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: { ...hooks.configs.recommended.rules, 'react-refresh/only-export-components': ['error', { allowConstantExport: true }] } },
)
