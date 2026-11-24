// 語法檢查設定。各資料夾能用的全域變數分開列，順便守住分工：
// 引擎只拿得到兩個曆法函式庫，碰 document 或 Node 的 API 都會被擋下
import js from '@eslint/js';
import globals from 'globals';

const libs = { Solar: 'readonly', Lunar: 'readonly', LunarYear: 'readonly', iztro: 'readonly' };
const rules = {
  'no-unused-vars': ['error', { caughtErrors: 'none' }],
  'no-shadow': 'error',
  eqeqeq: 'error',
  'no-use-before-define': ['error', { functions: false, variables: true }],
};

export default [
  // ios/ 裡的網頁是 npx cap sync 從 dist/app 複製過去的建置結果（App/public），和 Xcode 產生的檔案一樣不檢查
  { ignores: ['dist/**', 'node_modules/**', 'ios/**'] },
  js.configs.recommended,
  { languageOptions: { ecmaVersion: 2022, sourceType: 'module' }, rules },
  { files: ['src/engine/**'], languageOptions: { globals: libs } },
  { files: ['src/app/**'], languageOptions: { globals: { ...globals.browser, ...libs } } },
  // 網頁 App 的 service worker（第 13 版）：在 worker 裡跑，沒有 document
  { files: ['src/sw.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['scripts/**', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  // 測試在 Node 執行，但 page.evaluate 裡的函式是送到瀏覽器跑的，所以兩邊的全域變數都會出現
  { files: ['test/**'], languageOptions: { globals: { ...globals.node, ...globals.browser, ...libs } }, rules: { 'no-shadow': 'off' } },
];
