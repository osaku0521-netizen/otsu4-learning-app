// scripts/test_browser_runtime.js
// ブラウザ読み込み環境のシミュレーションテスト

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = {
  window: {},
  self: {},
  console: console,
  document: {
    addEventListener: () => {}
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  }
};
context.window = context;
context.self = context;

vm.createContext(context);

const scriptFiles = [
  '../data/questions_hourei.js',
  '../data/questions_butsukagi.js',
  '../data/questions_seikashoka.js',
  '../data/questions.js',
  '../data/textbook.js',
  '../data/glossary.js'
];

scriptFiles.forEach(file => {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  vm.runInContext(code, context);
  console.log(`✓ Evaluated ${file} in browser context`);
});

console.log('\n--- グローバル変数検証 ---');
console.log('OTSU4_HOUREI length:', context.OTSU4_HOUREI ? context.OTSU4_HOUREI.length : 'undefined');
console.log('OTSU4_BUTSUKAGI length:', context.OTSU4_BUTSUKAGI ? context.OTSU4_BUTSUKAGI.length : 'undefined');
console.log('OTSU4_SEIKASHOKA length:', context.OTSU4_SEIKASHOKA ? context.OTSU4_SEIKASHOKA.length : 'undefined');
console.log('OTSU4_QUESTIONS length:', context.OTSU4_QUESTIONS ? context.OTSU4_QUESTIONS.length : 'undefined');
console.log('OTSU4_TEXTBOOK parts count:', context.OTSU4_TEXTBOOK ? context.OTSU4_TEXTBOOK.length : 'undefined');
console.log('OTSU4_GLOSSARY terms count:', context.OTSU4_GLOSSARY ? context.OTSU4_GLOSSARY.length : 'undefined');

if (context.OTSU4_QUESTIONS && context.OTSU4_QUESTIONS.length === 300) {
  console.log('\n SUCCESS: ブラウザ読み込みテスト完全合格！全300問が正常にロードされました！');
} else {
  console.error('\n FAILED: ロードされた問題数が300問ではありません');
  process.exit(1);
}
