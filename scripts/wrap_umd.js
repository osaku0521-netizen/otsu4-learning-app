// scripts/wrap_umd.js
const fs = require('fs');
const path = require('path');

const files = [
  { file: 'questions_hourei.js', globalName: 'OTSU4_HOUREI' },
  { file: 'questions_butsukagi.js', globalName: 'OTSU4_BUTSUKAGI' },
  { file: 'questions_seikashoka.js', globalName: 'OTSU4_SEIKASHOKA' }
];

files.forEach(f => {
  const filePath = path.join(__dirname, '../data', f.file);
  const data = require(filePath);
  const content = `(function(root) {
  const data = ${JSON.stringify(data, null, 2)};
  if (typeof module === 'object' && module.exports) {
    module.exports = data;
  } else {
    root.${f.globalName} = data;
  }
})(typeof self !== 'undefined' ? self : this);\n`;
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Wrapped ${f.globalName} (${data.length} items) successfully!`);
});
