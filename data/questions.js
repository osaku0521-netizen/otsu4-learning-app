// data/questions.js
// 乙種第4類 危険物取扱者試験 厳選全300問統合データ
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./questions_hourei', './questions_butsukagi', './questions_seikashoka'], factory);
  } else if (typeof module === 'object' && module.exports) {
    const q1 = require('./questions_hourei.js');
    const q2 = require('./questions_butsukagi.js');
    const q3 = require('./questions_seikashoka.js');
    module.exports = factory(q1, q2, q3);
  } else {
    // ブラウザ環境
    root.OTSU4_QUESTIONS = factory(
      root.OTSU4_HOUREI || [],
      root.OTSU4_BUTSUKAGI || [],
      root.OTSU4_SEIKASHOKA || []
    );
  }
})(typeof self !== 'undefined' ? self : this, function(hourei, butsukagi, seikashoka) {
  const allQuestions = [...hourei, ...butsukagi, ...seikashoka];
  return allQuestions;
});
