// ESLint 平铺配置。报错信息写明该用什么。存量问题走棘轮（lint-baseline.json），只准降不准升。
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const SUPPRESSION = '不要压制检查。修掉问题；确实是检查本身错了，写明理由和到期日：eslint-disable-next-line <规则> 到期 2027-01-31 <理由>';

// 本仓自己的规则：压制检查的注释必须带到期日。到期后还在，就该修掉问题或者删掉注释。
const suppressionExpiry = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = context.sourceCode.getText(comment);
          if (/eslint-disable/.test(text) && !/到期 \d{4}-\d{2}-\d{2}/.test(text)) context.report({ loc: comment.loc, message: SUPPRESSION });
        }
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.runtime/**', '**/build/**', '**/coverage/**', '**/generated/**', 'apps/ios/**', 'apps/web/public/**', 'apps/web/src/shared/i18n/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: { twh: { rules: { 'suppression-expiry': suppressionExpiry } } },
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.es2024 } },
    rules: {
      // 存量里已经成片的规则降为警告，数量进棘轮（lint-baseline.json），只准降不准升。新代码多一处就红。
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-expect-error': true, 'ts-nocheck': true }],
      'no-unsafe-finally': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'preserve-caught-error': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-control-regex': 'warn',
      'no-useless-assignment': 'warn',
      'prefer-const': 'warn',
      'no-extra-boolean-cast': 'warn',
      'twh/suppression-expiry': 'error',
    },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // 启动 Electron 只允许出现在驾驭层。存量脚本由棘轮兜底，新脚本一律走 twh 或 installed-app-session。
    files: ['scripts/**/*.{mjs,cjs}', 'apps/desktop/**/*.{mjs,cjs}'],
    ignores: ['scripts/twh/**', 'scripts/installed-app-session.mjs', 'scripts/dev-desktop.mjs', 'scripts/prepare-app-store-assets.mjs', 'apps/desktop/src/main.mjs', 'apps/desktop/src/preload.cjs'],
    rules: {
      'no-restricted-imports': [
        'warn',
        { name: 'electron', message: '直接启动 Electron 绕过了隔离。用 scripts/twh（Web 验证）或 scripts/installed-app-session.mjs（已安装应用）。' },
        { name: '@playwright/test', importNames: ['_electron'], message: '直接 _electron.launch 绕过了隔离。用 scripts/twh（Web 验证）或 scripts/installed-app-session.mjs（已安装应用）。' },
      ],
    },
  },
  {
    files: ['**/*.test.*', 'studio/test/**'],
    rules: { 'no-restricted-syntax': ['error', { selector: "CallExpression[callee.property.name='only'][callee.object.name=/^(it|test|describe)$/]", message: '测试不能 .only()。只跑一个用例用 vitest -t 或 node --test --test-name-pattern。' }] },
  },
);
