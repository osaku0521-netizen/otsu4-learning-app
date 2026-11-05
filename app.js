// app.js - 乙種第4類 危険物取扱者試験 学習サイト コアロジック
document.addEventListener('DOMContentLoaded', () => {
  // --- グローバルステート ---
  const state = {
    allQuestions: window.OTSU4_QUESTIONS || [],
    textbookData: window.OTSU4_TEXTBOOK || [],
    glossaryData: window.OTSU4_GLOSSARY || [],
    currentTab: 'practice', // 'practice' | 'mock' | 'textbook' | 'glossary' | 'stats'
    practiceSubMode: 'standard', // 'standard' | 'marubatsu'
    
    // 演習モード状態
    practice: {
      category: 'all',
      importance: 'all',
      chapterFilter: null, // { id: string, title: string, subCategories: string[] } | null
      onlyUnattempted: false,
      onlyWrong: false,
      onlyBookmarked: false,
      shuffleQuestions: true,
      shuffleOptions: true,
      list: [],
      currentIndex: 0,
      currentShuffledQ: null,
      answered: false,
      userSelectedIndex: null
    },

    // 〇✕瞬殺特訓モード状態
    marubatsu: {
      category: 'all',
      importance: 'all',
      onlyUnattempted: false,
      onlyWrong: false,
      pool: [],
      list: [],
      currentIndex: 0,
      currentStreak: 0,
      maxStreak: 0,
      sessionAnswered: 0,
      sessionCorrect: 0,
      answered: false,
      selectedAnswer: null
    },

    // 模擬試験モード状態
    mock: {
      status: 'idle', // 'idle' | 'running' | 'finished'
      questions: [], // 35問 (shuffled options + original metadata)
      currentIndex: 0,
      userAnswers: {}, // index -> selectedOptionIndex
      flagged: {}, // index -> boolean
      timerSeconds: 120 * 60, // 120分
      timerInterval: null,
      results: null
    },

    // 用語集状態
    glossary: {
      searchQuery: '',
      category: 'all'
    },

    // ユーザー履歴 (LocalStorage)
    userData: loadUserData()
  };

  // --- ローカルストレージ管理 ---
  function loadUserData() {
    let data = {
      history: {}, // questionId -> { attempts: number, correct: number, lastAnswered: timestamp }
      bookmarks: {}, // questionId -> boolean
      mockHistory: [], // { date, score, total, categoryScores, passed }
      marubatsuHistory: {}, // mbId -> { attempts: number, correct: number, lastAnswered: timestamp }
      marubatsuMaxStreak: 0
    };
    try {
      const saved = localStorage.getItem('otsu4_user_data_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        data = { ...data, ...parsed };
        data.marubatsuHistory = data.marubatsuHistory || {};
        data.marubatsuMaxStreak = data.marubatsuMaxStreak || 0;
      }
    } catch (e) {
      console.warn('LocalStorage load error:', e);
    }
    return data;
  }

  function saveUserData() {
    try {
      localStorage.setItem('otsu4_user_data_v1', JSON.stringify(state.userData));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  // --- 汎用ユーティリティ ---
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function createShuffledQuestion(originalQ, doShuffleOptions) {
    if (!doShuffleOptions) {
      return {
        ...originalQ,
        displayOptions: [...originalQ.options],
        correctDisplayIndex: originalQ.answerIndex
      };
    }
    const originalAnswerText = originalQ.options[originalQ.answerIndex];
    const indices = [0, 1, 2, 3, 4];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const displayOptions = indices.map(idx => originalQ.options[idx]);
    const correctDisplayIndex = displayOptions.indexOf(originalAnswerText);
    return {
      ...originalQ,
      displayOptions,
      correctDisplayIndex
    };
  }

  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // --- サブカテゴリ ⇔ テキスト各章 マッピング定義 ---
  const SUBCATEGORY_TO_CHAPTER = {
    '危険物の定義・品名': { chapterId: 'tb-1-1', title: '第1章 危険物の定義・品名・指定数量', part: '第1編 法令' },
    '指定数量とその計算': { chapterId: 'tb-1-1', title: '第1章 危険物の定義・品名・指定数量', part: '第1編 法令' },
    '製造所等の区分': { chapterId: 'tb-1-2', title: '第2章 製造所等の区分と施設基準', part: '第1編 法令' },
    '許認可・手続き': { chapterId: 'tb-1-2', title: '第2章 製造所等の区分と施設基準', part: '第1編 法令' },
    '保安距離・保有空地': { chapterId: 'tb-1-2', title: '第2章 製造所等の区分と施設基準', part: '第1編 法令' },
    '取扱者・免状・保安体制': { chapterId: 'tb-1-3', title: '第3章 危険物取扱者制度と保安管理体制', part: '第1編 法令' },
    '構造・設備基準': { chapterId: 'tb-1-4', title: '第4章 製造所等の構造・設備の技術基準', part: '第1編 法令' },
    '標識・掲示板': { chapterId: 'tb-1-5', title: '第5章 標識・掲示板及び消火・警報設備', part: '第1編 法令' },
    '消火・警報設備': { chapterId: 'tb-1-5', title: '第5章 標識・掲示板及び消火・警報設備', part: '第1編 法令' },
    '貯蔵・取扱・運搬・移送': { chapterId: 'tb-1-6', title: '第6章 貯蔵・取扱・運搬・移送の基準', part: '第1編 法令' },

    '燃焼の基礎理論': { chapterId: 'tb-2-1', title: '第1章 燃焼理論・引火点・発火点・燃焼範囲', part: '第2編 物理化学' },
    '燃焼の形態': { chapterId: 'tb-2-1', title: '第1章 燃焼理論・引火点・発火点・燃焼範囲', part: '第2編 物理化学' },
    '引火点・発火点・燃焼範囲': { chapterId: 'tb-2-1', title: '第1章 燃焼理論・引火点・発火点・燃焼範囲', part: '第2編 物理化学' },
    '消火理論と消火剤': { chapterId: 'tb-2-2', title: '第2章 消火理論・自然発火・静電気対策', part: '第2編 物理化学' },
    '自然発火の機構': { chapterId: 'tb-2-2', title: '第2章 消火理論・自然発火・静電気対策', part: '第2編 物理化学' },
    '静電気の性質と災害防止': { chapterId: 'tb-2-2', title: '第2章 消火理論・自然発火・静電気対策', part: '第2編 物理化学' },
    '状態変化と熱力学': { chapterId: 'tb-2-3', title: '第3章 状態変化・熱力学及び気体の法則', part: '第2編 物理化学' },
    '化学の基礎': { chapterId: 'tb-2-4', title: '第4章 化学の基礎・熱化学及び有機化学', part: '第2編 物理化学' },
    '熱化学・ヘスの法則': { chapterId: 'tb-2-4', title: '第4章 化学の基礎・熱化学及び有機化学', part: '第2編 物理化学' },

    '第4類の共通性状': { chapterId: 'tb-3-1', title: '第1章 第4類危険物の共通性状と類別比較', part: '第3編 性質消火' },
    '特殊引火物': { chapterId: 'tb-3-2', title: '第2章 特殊引火物・第1石油類・アルコール類', part: '第3編 性質消火' },
    '第1石油類': { chapterId: 'tb-3-2', title: '第2章 特殊引火物・第1石油類・アルコール類', part: '第3編 性質消火' },
    'アルコール類': { chapterId: 'tb-3-2', title: '第2章 特殊引火物・第1石油類・アルコール類', part: '第3編 性質消火' },
    '第2石油類': { chapterId: 'tb-3-3', title: '第3章 第2石油類・第3石油類・第4石油類・動植物油類', part: '第3編 性質消火' },
    '第3石油類〜動植物油類': { chapterId: 'tb-3-3', title: '第3章 第2石油類・第3石油類・第4石油類・動植物油類', part: '第3編 性質消火' },
    '危険物の類別概括': { chapterId: 'tb-3-4', title: '第4章 危険物の類別概括（第1類〜第6類）比較表', part: '第3編 性質消火' }
  };

  const CHAPTER_TO_SUBCATEGORIES = {
    'tb-1-1': ['危険物の定義・品名', '指定数量とその計算'],
    'tb-1-2': ['製造所等の区分', '許認可・手続き', '保安距離・保有空地'],
    'tb-1-3': ['取扱者・免状・保安体制'],
    'tb-1-4': ['構造・設備基準'],
    'tb-1-5': ['標識・掲示板', '消火・警報設備'],
    'tb-1-6': ['貯蔵・取扱・運搬・移送'],
    'tb-2-1': ['燃焼の基礎理論', '燃焼の形態', '引火点・発火点・燃焼範囲'],
    'tb-2-2': ['消火理論と消火剤', '自然発火の機構', '静電気の性質と災害防止'],
    'tb-2-3': ['状態変化と熱力学'],
    'tb-2-4': ['化学の基礎', '熱化学・ヘスの法則'],
    'tb-3-1': ['第4類の共通性状'],
    'tb-3-2': ['特殊引火物', '第1石油類', 'アルコール類'],
    'tb-3-3': ['第2石油類', '第3石油類〜動植物油類'],
    'tb-3-4': ['危険物の類別概括']
  };

  // --- 双方向リンク アクション関数 ---
  // ① 問題解説からテキスト該当章へジャンプ
  window.jumpToTextbookChapter = function(chapterId) {
    window.switchTab('textbook');
    setTimeout(() => {
      const el = document.getElementById(chapterId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-4', 'ring-sky-400', 'transition-all');
        setTimeout(() => {
          el.classList.remove('ring-4', 'ring-sky-400');
        }, 2500);
      }
    }, 120);
  };

  // ② テキスト各章から対応問題の一問一答演習を開始
  window.startChapterPractice = function(chapterId) {
    const subcats = CHAPTER_TO_SUBCATEGORIES[chapterId];
    if (!subcats) return;

    let chTitle = '';
    for (const part of state.textbookData) {
      const found = part.chapters.find(c => c.id === chapterId);
      if (found) {
        chTitle = `${part.part} ${found.title}`;
        break;
      }
    }

    state.practice.chapterFilter = {
      id: chapterId,
      title: chTitle || '選択した章',
      subCategories: subcats
    };

    // フィルタ条件の初期化
    state.practice.category = 'all';
    state.practice.importance = 'all';
    state.practice.onlyUnattempted = false;
    state.practice.onlyWrong = false;
    state.practice.onlyBookmarked = false;

    preparePracticeQuestions();
    window.switchTab('practice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- タブ切り替え ---
  const navTabs = document.querySelectorAll('.nav-tab');
  const mobileNavTabs = document.querySelectorAll('.mobile-nav-tab');
  const mobileTabLabel = document.getElementById('mobile-current-tab-label');

  const tabNamesMap = {
    practice: '一問一答',
    marubatsu: '〇✕特訓',
    mock: '本番模試',
    textbook: '要点テキスト',
    glossary: '用語解説',
    stats: '学習進捗'
  };

  const sections = {
    practice: document.getElementById('sec-practice'),
    mock: document.getElementById('sec-mock'),
    textbook: document.getElementById('sec-textbook'),
    glossary: document.getElementById('sec-glossary'),
    stats: document.getElementById('sec-stats')
  };

  window.switchTab = function(tabName) {
    if (tabName === 'marubatsu') {
      state.currentTab = 'practice';
      state.practiceSubMode = 'marubatsu';
    } else {
      state.currentTab = tabName;
    }

    const effectiveDesktopTab = (tabName === 'marubatsu' || (state.currentTab === 'practice' && state.practiceSubMode === 'marubatsu'))
      ? 'marubatsu'
      : state.currentTab;

    // デスクトップ ナビゲーション更新
    navTabs.forEach(btn => {
      const isTarget = btn.dataset.tab === effectiveDesktopTab;
      btn.classList.toggle('text-sky-600', isTarget);
      btn.classList.toggle('border-b-2', isTarget);
      btn.classList.toggle('border-sky-600', isTarget);
      btn.classList.toggle('font-bold', isTarget);
      btn.classList.toggle('text-slate-600', !isTarget);
    });

    // モバイル用 ボトムナビゲーション更新
    mobileNavTabs.forEach(btn => {
      const isTarget = btn.dataset.tab === state.currentTab;
      btn.classList.toggle('text-sky-600', isTarget);
      btn.classList.toggle('font-bold', isTarget);
      btn.classList.toggle('text-slate-500', !isTarget);
      btn.classList.toggle('font-medium', !isTarget);
    });

    // モバイル用 ヘッダー現在タブバッジ更新
    if (mobileTabLabel) {
      if (state.currentTab === 'practice' && state.practiceSubMode === 'marubatsu') {
        mobileTabLabel.textContent = '〇✕特訓';
      } else if (tabNamesMap[state.currentTab]) {
        mobileTabLabel.textContent = tabNamesMap[state.currentTab];
      }
    }

    Object.keys(sections).forEach(key => {
      if (sections[key]) {
        sections[key].classList.toggle('hidden', key !== state.currentTab);
      }
    });

    if (state.currentTab === 'practice') {
      updatePracticeSubModeUI();
      if (state.practiceSubMode === 'marubatsu') {
        renderMarubatsuView();
      } else {
        renderPracticeView();
      }
    } else if (state.currentTab === 'textbook') {
      renderTextbookView();
    } else if (state.currentTab === 'glossary') {
      renderGlossaryView();
    } else if (state.currentTab === 'stats') {
      renderStatsView();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  navTabs.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  mobileNavTabs.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ==========================================
  // 1. 一問一答・分野別演習モード
  // ==========================================
  function preparePracticeQuestions() {
    let list = [...state.allQuestions];

    // テキスト連動章フィルタ（章指定演習）
    if (state.practice.chapterFilter) {
      const targetSubcats = state.practice.chapterFilter.subCategories || [];
      list = list.filter(q => targetSubcats.includes(q.subCategory));
    } else {
      // 通常の分野フィルタ
      if (state.practice.category !== 'all') {
        list = list.filter(q => q.category === state.practice.category);
      }
    }

    // 頻出度フィルタ
    if (state.practice.importance !== 'all') {
      const targetImp = parseInt(state.practice.importance, 10);
      list = list.filter(q => q.importance === targetImp);
    }

    // 未出題（まだ解いていない問題）のみ
    if (state.practice.onlyUnattempted) {
      list = list.filter(q => {
        const hist = state.userData.history[q.id];
        return !hist || !hist.attempts || hist.attempts === 0;
      });
    }

    // 苦手問題（間違えた問題）のみ
    if (state.practice.onlyWrong) {
      list = list.filter(q => {
        const hist = state.userData.history[q.id];
        return hist && (hist.attempts > hist.correct);
      });
    }

    // ブックマークのみ
    if (state.practice.onlyBookmarked) {
      list = list.filter(q => state.userData.bookmarks[q.id]);
    }

    // 出題順シャッフル
    if (state.practice.shuffleQuestions) {
      list = shuffleArray(list);
    }

    state.practice.list = list;
    state.practice.currentIndex = 0;
    state.practice.answered = false;
    state.practice.userSelectedIndex = null;
    loadCurrentPracticeQuestion();
  }

  function loadCurrentPracticeQuestion() {
    if (state.practice.list.length === 0) {
      state.practice.currentShuffledQ = null;
      return;
    }
    const q = state.practice.list[state.practice.currentIndex];
    state.practice.currentShuffledQ = createShuffledQuestion(q, state.practice.shuffleOptions);
    state.practice.answered = false;
    state.practice.userSelectedIndex = null;
  }

  function renderPracticeView() {
    const container = document.getElementById('practice-card-container');
    const emptyState = document.getElementById('practice-empty-state');
    const q = state.practice.currentShuffledQ;

    // テキスト連動章フィルタバナーの表示・非表示
    const chapterBanner = document.getElementById('practice-chapter-banner');
    if (chapterBanner) {
      if (state.practice.chapterFilter) {
        chapterBanner.classList.remove('hidden');
        document.getElementById('practice-chapter-title').textContent = state.practice.chapterFilter.title;
      } else {
        chapterBanner.classList.add('hidden');
      }
    }

    // フィルタ状態同期
    document.getElementById('filter-category').value = state.practice.category;
    document.getElementById('filter-importance').value = state.practice.importance;
    document.getElementById('filter-only-unattempted').checked = state.practice.onlyUnattempted;
    document.getElementById('filter-only-wrong').checked = state.practice.onlyWrong;
    document.getElementById('filter-only-bookmark').checked = state.practice.onlyBookmarked;
    document.getElementById('toggle-shuffle-q').checked = state.practice.shuffleQuestions;
    document.getElementById('toggle-shuffle-opt').checked = state.practice.shuffleOptions;

    // カウント表示
    document.getElementById('practice-total-count').textContent = state.practice.list.length;
    document.getElementById('practice-current-num').textContent = state.practice.list.length > 0 ? (state.practice.currentIndex + 1) : 0;

    if (!q || state.practice.list.length === 0) {
      container.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    // 問題情報ヘッダー
    const isBookmarked = !!state.userData.bookmarks[q.id];
    const bookmarkBtn = document.getElementById('practice-bookmark-btn');
    bookmarkBtn.innerHTML = isBookmarked 
      ? `<svg class="w-6 h-6 text-amber-500 fill-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/></svg>`
      : `<svg class="w-6 h-6 text-slate-400 hover:text-amber-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>`;

    document.getElementById('q-category-badge').textContent = q.category;
    document.getElementById('q-subcategory-badge').textContent = q.subCategory;

    // 頻出度バッジ
    const impEl = document.getElementById('q-importance-stars');
    const stars = q.importance === 3 ? '★★★ 超頻出' : q.importance === 2 ? '★★☆ 頻出' : '★☆☆ 基本';
    const starColor = q.importance === 3 ? 'bg-rose-50 text-rose-600 border-rose-200' : q.importance === 2 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200';
    impEl.className = `px-2.5 py-0.5 rounded-full text-xs font-semibold border ${starColor}`;
    impEl.textContent = stars;

    // 問題文
    document.getElementById('q-text').textContent = q.question;

    // 選択肢レンダリング
    const optionsContainer = document.getElementById('practice-options');
    optionsContainer.innerHTML = '';

    const answered = state.practice.answered;
    const userAns = state.practice.userSelectedIndex;
    const correctAns = q.correctDisplayIndex;

    q.displayOptions.forEach((optText, optIdx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `option-btn w-full text-left p-3.5 sm:p-4 rounded-xl border text-sm sm:text-base font-medium flex items-start space-x-3 transition-all `;

      let badgeClass = 'w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ';
      let badgeText = `${optIdx + 1}`;

      if (!answered) {
        btn.className += 'border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50/50 text-slate-700';
        badgeClass += 'bg-slate-100 text-slate-600 border border-slate-200';
      } else {
        btn.disabled = true;
        if (optIdx === correctAns) {
          // 正解肢
          btn.className += 'border-emerald-500 bg-emerald-50/90 text-emerald-900 font-semibold ring-2 ring-emerald-400';
          badgeClass += 'bg-emerald-500 text-white';
          badgeText = '✓';
        } else if (optIdx === userAns) {
          // ユーザーが選んだ誤答
          btn.className += 'border-rose-400 bg-rose-50 text-rose-800';
          badgeClass += 'bg-rose-500 text-white';
          badgeText = '✕';
        } else {
          btn.className += 'border-slate-200 bg-slate-50 text-slate-400 opacity-60';
          badgeClass += 'bg-slate-200 text-slate-400';
        }
      }

      btn.innerHTML = `<span class="${badgeClass}">${badgeText}</span><span class="pt-0.5 leading-relaxed break-words flex-1">${optText}</span>`;

      if (!answered) {
        btn.addEventListener('click', () => handlePracticeAnswer(optIdx));
      }
      optionsContainer.appendChild(btn);
    });

    // 解説カード
    const expCard = document.getElementById('practice-explanation-card');
    if (answered) {
      expCard.classList.remove('hidden');
      const isCorrect = (userAns === correctAns);
      const resultBanner = document.getElementById('practice-result-banner');
      resultBanner.className = `p-4 rounded-xl flex items-center space-x-3 mb-4 ${isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`;
      resultBanner.innerHTML = isCorrect
        ? `<div class="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-lg">○</div><div><p class="font-bold text-base">正解です！素晴らしい！</p><p class="text-xs text-emerald-700">この調子で知識を定着させましょう。</p></div>`
        : `<div class="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-lg">✕</div><div><p class="font-bold text-base">不正解です</p><p class="text-xs text-rose-700">正解は [選択肢 ${correctAns + 1}] です。解説を確認して復習しましょう。</p></div>`;

      // 解説本文
      document.getElementById('practice-explanation-text').innerHTML = formatExplanationText(
        q.explanation,
        q.correctDisplayIndex,
        q.displayOptions
      );

      // 要点テキスト連動リンクの動的生成
      const textbookLinkArea = document.getElementById('practice-textbook-link-area');
      if (textbookLinkArea) {
        const chInfo = SUBCATEGORY_TO_CHAPTER[q.subCategory];
        if (chInfo) {
          textbookLinkArea.innerHTML = `
            <div class="p-3.5 bg-gradient-to-r from-sky-50 to-indigo-50/80 border border-sky-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div class="flex items-center space-x-3">
                <div class="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                  📖
                </div>
                <div>
                  <span class="text-[11px] font-bold text-sky-700 tracking-wide block">要点テキストでこの論点を確認</span>
                  <span class="text-sm font-extrabold text-slate-900">${chInfo.part} / ${chInfo.title}</span>
                </div>
              </div>
              <button type="button" onclick="window.jumpToTextbookChapter('${chInfo.chapterId}')" class="px-4 py-2 bg-white hover:bg-sky-600 hover:text-white text-sky-700 border border-sky-300 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 flex items-center justify-center space-x-1.5 cursor-pointer">
                <span>テキストを開く</span>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </button>
            </div>
          `;
        } else {
          textbookLinkArea.innerHTML = '';
        }
      }
    } else {
      expCard.classList.add('hidden');
    }

    // ナビゲーションボタン状態
    document.getElementById('btn-prev-q').disabled = (state.practice.currentIndex === 0);
    document.getElementById('btn-next-q').disabled = (state.practice.currentIndex >= state.practice.list.length - 1);
  }

  function formatExplanationText(raw, correctDisplayIndex, displayOptions) {
    if (!raw) return '';

    let body = raw;

    // もし現在の表示上の正解インデックス(0〜4)が指定されている場合
    if (typeof correctDisplayIndex === 'number' && correctDisplayIndex >= 0) {
      const displayNum = correctDisplayIndex + 1;
      const correctText = (displayOptions && displayOptions[correctDisplayIndex])
        ? displayOptions[correctDisplayIndex]
        : '';

      // 静的な 【正解: \d+】 を削除し、現在の画面表示（シャッフル後）の番号と正解テキストをヘッダーバッジとして付与
      body = body.replace(/【正解:\s*\d+】\s*/g, '');

      const headerBadge = `
        <div class="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex flex-wrap items-center gap-2">
          <span class="px-2.5 py-1 bg-emerald-600 text-white font-extrabold rounded-lg text-xs shrink-0 shadow-sm">正解: 肢${displayNum}</span>
          <span class="font-bold text-emerald-950 text-xs sm:text-sm leading-snug">「${correctText}」</span>
        </div>
      `;

      return headerBadge + body
        .replace(/\n/g, '<br>')
        .replace(/(【.*?】)/g, '<strong class="text-slate-900 font-bold block mt-2 mb-1">$1</strong>');
    }

    // フォールバック（インデックス未指定時）
    return body
      .replace(/【正解:\s*(\d+)】/g, '<span class="inline-block px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg text-sm mr-2 mb-2">正解: 肢$1</span>')
      .replace(/\n/g, '<br>')
      .replace(/(【.*?】)/g, '<strong class="text-slate-900 font-bold block mt-2 mb-1">$1</strong>');
  }

  function handlePracticeAnswer(selectedIdx) {
    if (state.practice.answered) return;
    state.practice.answered = true;
    state.practice.userSelectedIndex = selectedIdx;

    const q = state.practice.currentShuffledQ;
    const isCorrect = (selectedIdx === q.correctDisplayIndex);

    // ユーザー履歴更新
    if (!state.userData.history[q.id]) {
      state.userData.history[q.id] = { attempts: 0, correct: 0, lastAnswered: Date.now() };
    }
    state.userData.history[q.id].attempts++;
    if (isCorrect) state.userData.history[q.id].correct++;
    state.userData.history[q.id].lastAnswered = Date.now();
    saveUserData();

    renderPracticeView();
  }

  // ブックマークトグル
  document.getElementById('practice-bookmark-btn').addEventListener('click', () => {
    const q = state.practice.currentShuffledQ;
    if (!q) return;
    state.userData.bookmarks[q.id] = !state.userData.bookmarks[q.id];
    saveUserData();
    renderPracticeView();
  });

  // 前へ・次へボタン
  document.getElementById('btn-prev-q').addEventListener('click', () => {
    if (state.practice.currentIndex > 0) {
      state.practice.currentIndex--;
      loadCurrentPracticeQuestion();
      renderPracticeView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btn-next-q').addEventListener('click', () => {
    if (state.practice.currentIndex < state.practice.list.length - 1) {
      state.practice.currentIndex++;
      loadCurrentPracticeQuestion();
      renderPracticeView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // フィルタイベント
  document.getElementById('filter-category').addEventListener('change', (e) => {
    state.practice.category = e.target.value;
    state.practice.chapterFilter = null; // カテゴリ変更時は章指定を解除
    preparePracticeQuestions();
    renderPracticeView();
  });

  // 章指定演習の解除ボタン
  const btnExitChapter = document.getElementById('btn-exit-chapter-practice');
  if (btnExitChapter) {
    btnExitChapter.addEventListener('click', () => {
      state.practice.chapterFilter = null;
      preparePracticeQuestions();
      renderPracticeView();
    });
  }

  document.getElementById('filter-importance').addEventListener('change', (e) => {
    state.practice.importance = e.target.value;
    preparePracticeQuestions();
    renderPracticeView();
  });

  document.getElementById('filter-only-unattempted').addEventListener('change', (e) => {
    state.practice.onlyUnattempted = e.target.checked;
    if (state.practice.onlyUnattempted) {
      state.practice.onlyWrong = false;
      document.getElementById('filter-only-wrong').checked = false;
    }
    preparePracticeQuestions();
    renderPracticeView();
  });

  document.getElementById('filter-only-wrong').addEventListener('change', (e) => {
    state.practice.onlyWrong = e.target.checked;
    if (state.practice.onlyWrong) {
      state.practice.onlyUnattempted = false;
      document.getElementById('filter-only-unattempted').checked = false;
    }
    preparePracticeQuestions();
    renderPracticeView();
  });

  document.getElementById('filter-only-bookmark').addEventListener('change', (e) => {
    state.practice.onlyBookmarked = e.target.checked;
    preparePracticeQuestions();
    renderPracticeView();
  });

  document.getElementById('toggle-shuffle-q').addEventListener('change', (e) => {
    state.practice.shuffleQuestions = e.target.checked;
    preparePracticeQuestions();
    renderPracticeView();
  });

  document.getElementById('toggle-shuffle-opt').addEventListener('change', (e) => {
    state.practice.shuffleOptions = e.target.checked;
    loadCurrentPracticeQuestion();
    renderPracticeView();
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    state.practice.category = 'all';
    state.practice.importance = 'all';
    state.practice.chapterFilter = null;
    state.practice.onlyUnattempted = false;
    state.practice.onlyWrong = false;
    state.practice.onlyBookmarked = false;
    state.practice.shuffleQuestions = true;
    state.practice.shuffleOptions = true;
    preparePracticeQuestions();
    renderPracticeView();
  });

  // ==========================================
  // 1.5 演習サブモード切り替え & 〇✕瞬殺特訓モード
  // ==========================================
  window.switchPracticeSubMode = function(subMode) {
    state.practiceSubMode = subMode;
    updatePracticeSubModeUI();

    const effectiveDesktopTab = (subMode === 'marubatsu') ? 'marubatsu' : 'practice';
    navTabs.forEach(btn => {
      const isTarget = btn.dataset.tab === effectiveDesktopTab;
      btn.classList.toggle('text-sky-600', isTarget);
      btn.classList.toggle('border-b-2', isTarget);
      btn.classList.toggle('border-sky-600', isTarget);
      btn.classList.toggle('font-bold', isTarget);
      btn.classList.toggle('text-slate-600', !isTarget);
    });

    if (mobileTabLabel) {
      mobileTabLabel.textContent = (subMode === 'marubatsu') ? '〇✕特訓' : '一問一答';
    }

    if (subMode === 'marubatsu') {
      renderMarubatsuView();
    } else {
      renderPracticeView();
    }
  };

  window.switchToMarubatsuMode = function() {
    window.switchTab('marubatsu');
  };

  function updatePracticeSubModeUI() {
    const isMb = (state.practiceSubMode === 'marubatsu');
    const stdView = document.getElementById('practice-standard-view');
    const mbView = document.getElementById('practice-marubatsu-view');
    const btnStd = document.getElementById('btn-submode-standard');
    const btnMb = document.getElementById('btn-submode-marubatsu');

    if (stdView) stdView.classList.toggle('hidden', isMb);
    if (mbView) mbView.classList.toggle('hidden', !isMb);

    if (btnStd && btnMb) {
      if (isMb) {
        btnStd.className = 'flex-1 py-2 px-3 text-xs sm:text-sm font-extrabold rounded-xl transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center space-x-1.5 cursor-pointer';
        btnMb.className = 'flex-1 py-2 px-3 text-xs sm:text-sm font-extrabold rounded-xl transition-all shadow-xs bg-white text-amber-600 border border-amber-200/60 flex items-center justify-center space-x-1.5 cursor-pointer';
      } else {
        btnStd.className = 'flex-1 py-2 px-3 text-xs sm:text-sm font-extrabold rounded-xl transition-all shadow-xs bg-white text-sky-600 border border-sky-200/60 flex items-center justify-center space-x-1.5 cursor-pointer';
        btnMb.className = 'flex-1 py-2 px-3 text-xs sm:text-sm font-extrabold rounded-xl transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center space-x-1.5 cursor-pointer';
      }
    }
  }

  const btnSubStd = document.getElementById('btn-submode-standard');
  const btnSubMb = document.getElementById('btn-submode-marubatsu');
  if (btnSubStd) btnSubStd.addEventListener('click', () => switchPracticeSubMode('standard'));
  if (btnSubMb) btnSubMb.addEventListener('click', () => switchPracticeSubMode('marubatsu'));

  // --- 〇✕命題プール自動生成 ---
  function buildMarubatsuPool(allQuestions) {
    const items = [];
    allQuestions.forEach(q => {
      const isAskCorrect = q.question.includes('正しいもの') || q.question.includes('適切') || q.question.includes('該当するもの');
      const isAskWrong = q.question.includes('誤っている') || q.question.includes('異なる') || q.question.includes('含まれない') || q.question.includes('該当しない');

      if (!isAskCorrect && !isAskWrong) {
        const opt = q.options[q.answerIndex];
        if (opt && opt.length >= 12) {
          items.push({
            id: 'mb-' + q.id + '-' + q.answerIndex,
            sourceQuestionId: q.id,
            category: q.category,
            subCategory: q.subCategory,
            importance: q.importance,
            statement: opt,
            isCorrect: true,
            explanation: '【◯ 正しい記述】\n' + q.explanation.replace(/【正解:\s*[1-5]】\n?/, '')
          });
        }
        return;
      }

      q.options.forEach((opt, idx) => {
        if (!opt || opt.length < 10) return;
        
        let isTrue = false;
        if (isAskCorrect) isTrue = (idx === q.answerIndex);
        else if (isAskWrong) isTrue = (idx !== q.answerIndex);

        let exp = '';
        if (isTrue) {
          if (idx === q.answerIndex) {
            exp = '【◯ 正しい記述】\n' + q.explanation.replace(/【正解:\s*[1-5]】\n?/, '');
          } else {
            exp = '【◯ 正しい記述】\nこの記述は法令・基礎理論に合致した正しい内容です。\n（' + q.subCategory + 'の重要論点）';
          }
        } else {
          if (idx === q.answerIndex) {
            exp = '【✕ 誤りの記述】\n' + q.explanation.replace(/【正解:\s*[1-5]】\n?/, '');
          } else {
            exp = '【✕ 誤りの記述】\nこの記述には誤りが含まれています。\n（' + q.subCategory + 'の引っかけ論点）';
          }
        }

        items.push({
          id: 'mb-' + q.id + '-' + idx,
          sourceQuestionId: q.id,
          category: q.category,
          subCategory: q.subCategory,
          importance: q.importance,
          statement: opt,
          isCorrect: isTrue,
          explanation: exp
        });
      });
    });
    return items;
  }

  function prepareMarubatsuList() {
    if (state.marubatsu.pool.length === 0) {
      state.marubatsu.pool = buildMarubatsuPool(state.allQuestions);
    }

    let filtered = [...state.marubatsu.pool];

    // 科目フィルタ
    if (state.marubatsu.category !== 'all') {
      filtered = filtered.filter(item => item.category === state.marubatsu.category);
    }

    // 頻出度フィルタ
    if (state.marubatsu.importance !== 'all') {
      const imp = parseInt(state.marubatsu.importance, 10);
      filtered = filtered.filter(item => item.importance >= imp);
    }

    // 未出題のみフィルタ
    if (state.marubatsu.onlyUnattempted) {
      filtered = filtered.filter(item => {
        const h = state.userData.marubatsuHistory[item.id];
        return !h || h.attempts === 0;
      });
    }

    // 間違えた問題のみフィルタ
    if (state.marubatsu.onlyWrong) {
      filtered = filtered.filter(item => {
        const h = state.userData.marubatsuHistory[item.id];
        return h && h.attempts > h.correct;
      });
    }

    // シャッフル
    shuffleArray(filtered);

    state.marubatsu.list = filtered;
    state.marubatsu.currentIndex = 0;
    state.marubatsu.answered = false;
    state.marubatsu.selectedAnswer = null;
  }

  function renderMarubatsuView() {
    if (state.marubatsu.list.length === 0) {
      prepareMarubatsuList();
    }

    const total = state.marubatsu.list.length;
    const cardContainer = document.getElementById('mb-card-container');
    const emptyState = document.getElementById('mb-empty-state');
    const totalCountEl = document.getElementById('mb-total-count');
    const currentNumEl = document.getElementById('mb-current-num');

    if (total === 0) {
      if (cardContainer) cardContainer.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      if (totalCountEl) totalCountEl.textContent = '0';
      if (currentNumEl) currentNumEl.textContent = '0';
      return;
    }

    if (cardContainer) cardContainer.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    const currIdx = state.marubatsu.currentIndex;
    const item = state.marubatsu.list[currIdx];

    if (totalCountEl) totalCountEl.textContent = total;
    if (currentNumEl) currentNumEl.textContent = currIdx + 1;

    updateMarubatsuStatsUI();

    const catBadge = document.getElementById('mb-category-badge');
    const subBadge = document.getElementById('mb-subcategory-badge');
    const impBadge = document.getElementById('mb-importance-badge');
    const textEl = document.getElementById('mb-statement-text');

    if (catBadge) catBadge.textContent = item.category;
    if (subBadge) subBadge.textContent = item.subCategory;
    if (impBadge) {
      impBadge.textContent = '★'.repeat(item.importance) + (item.importance === 3 ? ' 超頻出' : item.importance === 2 ? ' 頻出' : ' 重要');
      impBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-semibold border ' + 
        (item.importance === 3 ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-slate-50 text-slate-600 border-slate-200');
    }

    if (textEl) {
      textEl.textContent = item.statement;
    }

    const actionsContainer = document.getElementById('mb-actions-container');
    const expCard = document.getElementById('mb-explanation-card');

    if (!state.marubatsu.answered) {
      if (actionsContainer) actionsContainer.classList.remove('hidden');
      if (expCard) expCard.classList.add('hidden');
    } else {
      if (actionsContainer) actionsContainer.classList.add('hidden');
      if (expCard) expCard.classList.remove('hidden');
      renderMarubatsuFeedback(item);
    }
  }

  function handleMarubatsuAnswer(userChoice) {
    if (state.marubatsu.answered) return;
    if (state.marubatsu.list.length === 0) return;

    const item = state.marubatsu.list[state.marubatsu.currentIndex];
    const isCorrect = (userChoice === item.isCorrect);

    state.marubatsu.answered = true;
    state.marubatsu.selectedAnswer = userChoice;
    state.marubatsu.sessionAnswered++;
    if (isCorrect) state.marubatsu.sessionCorrect++;

    // ストリーク
    if (isCorrect) {
      state.marubatsu.currentStreak++;
      if (state.marubatsu.currentStreak > state.marubatsu.maxStreak) {
        state.marubatsu.maxStreak = state.marubatsu.currentStreak;
      }
      if (state.marubatsu.currentStreak > (state.userData.marubatsuMaxStreak || 0)) {
        state.userData.marubatsuMaxStreak = state.marubatsu.currentStreak;
      }
    } else {
      state.marubatsu.currentStreak = 0;
    }

    // 履歴保存
    const hist = state.userData.marubatsuHistory[item.id] || { attempts: 0, correct: 0, lastAnswered: 0 };
    hist.attempts++;
    if (isCorrect) hist.correct++;
    hist.lastAnswered = Date.now();
    state.userData.marubatsuHistory[item.id] = hist;
    saveUserData();

    renderMarubatsuView();
  }

  function renderMarubatsuFeedback(item) {
    const isCorrect = (state.marubatsu.selectedAnswer === item.isCorrect);
    const resultBanner = document.getElementById('mb-result-banner');
    const expTextEl = document.getElementById('mb-explanation-text');
    const linkArea = document.getElementById('mb-textbook-link-area');

    if (resultBanner) {
      if (isCorrect) {
        resultBanner.className = 'p-4 sm:p-5 rounded-2xl flex items-center justify-between shadow-sm bg-emerald-50 border border-emerald-300 text-emerald-900 animate-fade-in';
        resultBanner.innerHTML = `
          <div class="flex items-center space-x-3">
            <span class="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-xl shadow-xs">✓</span>
            <div>
              <span class="font-black text-base sm:text-lg text-emerald-800">正解！</span>
              <p class="text-xs text-emerald-700 font-medium">この記述は <strong>【 ${item.isCorrect ? '◯ 正しい記述' : '✕ 誤りの記述'} 】</strong> です</p>
            </div>
          </div>
          <span class="px-3 py-1 bg-emerald-600 text-white font-extrabold text-xs rounded-full shadow-xs">🔥 ${state.marubatsu.currentStreak} 連続正解！</span>
        `;
      } else {
        resultBanner.className = 'p-4 sm:p-5 rounded-2xl flex items-center justify-between shadow-sm bg-rose-50 border border-rose-300 text-rose-900 animate-fade-in';
        resultBanner.innerHTML = `
          <div class="flex items-center space-x-3">
            <span class="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black text-xl shadow-xs">✕</span>
            <div>
              <span class="font-black text-base sm:text-lg text-rose-800">不正解…</span>
              <p class="text-xs text-rose-700 font-medium">正しくは <strong>【 ${item.isCorrect ? '◯ 正しい記述' : '✕ 誤りの記述'} 】</strong> です（あなたは ${state.marubatsu.selectedAnswer ? '◯' : '✕'} を選択）</p>
            </div>
          </div>
          <span class="px-3 py-1 bg-slate-200 text-slate-700 font-bold text-xs rounded-full">ストリークリセット</span>
        `;
      }
    }

    if (expTextEl) {
      expTextEl.textContent = item.explanation;
    }

    if (linkArea) {
      const chInfo = findChapterBySubCategory(item.subCategory);
      if (chInfo) {
        linkArea.innerHTML = `
          <div class="p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div class="flex items-center space-x-2 text-xs text-sky-900 font-bold">
              <span>📖</span>
              <span>要点テキストで復習: <strong>${chInfo.title}</strong></span>
            </div>
            <button type="button" onclick="window.jumpToTextbookChapter('${chInfo.chapterId}')" class="px-3 py-1.5 bg-white hover:bg-sky-600 hover:text-white text-sky-700 border border-sky-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center space-x-1 shrink-0 self-end sm:self-auto cursor-pointer">
              <span>テキストを開く</span>
              <span>➔</span>
            </button>
          </div>
        `;
      } else {
        linkArea.innerHTML = '';
      }
    }
  }

  function nextMarubatsuQuestion() {
    if (state.marubatsu.currentIndex < state.marubatsu.list.length - 1) {
      state.marubatsu.currentIndex++;
    } else {
      shuffleArray(state.marubatsu.list);
      state.marubatsu.currentIndex = 0;
    }
    state.marubatsu.answered = false;
    state.marubatsu.selectedAnswer = null;
    renderMarubatsuView();
  }

  function updateMarubatsuStatsUI() {
    const streakText = document.getElementById('mb-streak-text');
    const maxStreakEl = document.getElementById('mb-max-streak');
    const sessionAccEl = document.getElementById('mb-session-accuracy');
    const sessionCountsEl = document.getElementById('mb-session-counts');

    if (streakText) streakText.textContent = `${state.marubatsu.currentStreak}問連続正解中`;
    if (maxStreakEl) maxStreakEl.textContent = Math.max(state.marubatsu.maxStreak, state.userData.marubatsuMaxStreak || 0);

    const sAns = state.marubatsu.sessionAnswered;
    const sCor = state.marubatsu.sessionCorrect;
    const sPct = sAns > 0 ? Math.round((sCor / sAns) * 100) : 0;

    if (sessionAccEl) sessionAccEl.textContent = `${sPct}%`;
    if (sessionCountsEl) sessionCountsEl.textContent = `${sCor}/${sAns}問`;
  }

  // --- 〇✕操作イベント登録 ---
  const mbBtnTrue = document.getElementById('mb-btn-true');
  const mbBtnFalse = document.getElementById('mb-btn-false');
  const mbBtnNext = document.getElementById('mb-btn-next');

  if (mbBtnTrue) mbBtnTrue.addEventListener('click', () => handleMarubatsuAnswer(true));
  if (mbBtnFalse) mbBtnFalse.addEventListener('click', () => handleMarubatsuAnswer(false));
  if (mbBtnNext) mbBtnNext.addEventListener('click', () => nextMarubatsuQuestion());

  // 〇✕フィルター変更イベント
  const mbFilterCat = document.getElementById('mb-filter-category');
  const mbFilterImp = document.getElementById('mb-filter-importance');
  const mbFilterUnattempted = document.getElementById('mb-filter-only-unattempted');
  const mbFilterWrong = document.getElementById('mb-filter-only-wrong');
  const mbBtnReset = document.getElementById('mb-btn-reset-filters');

  if (mbFilterCat) {
    mbFilterCat.addEventListener('change', (e) => {
      state.marubatsu.category = e.target.value;
      prepareMarubatsuList();
      renderMarubatsuView();
    });
  }
  if (mbFilterImp) {
    mbFilterImp.addEventListener('change', (e) => {
      state.marubatsu.importance = e.target.value;
      prepareMarubatsuList();
      renderMarubatsuView();
    });
  }
  if (mbFilterUnattempted) {
    mbFilterUnattempted.addEventListener('change', (e) => {
      state.marubatsu.onlyUnattempted = e.target.checked;
      prepareMarubatsuList();
      renderMarubatsuView();
    });
  }
  if (mbFilterWrong) {
    mbFilterWrong.addEventListener('change', (e) => {
      state.marubatsu.onlyWrong = e.target.checked;
      prepareMarubatsuList();
      renderMarubatsuView();
    });
  }
  if (mbBtnReset) {
    mbBtnReset.addEventListener('click', () => {
      state.marubatsu.category = 'all';
      state.marubatsu.importance = 'all';
      state.marubatsu.onlyUnattempted = false;
      state.marubatsu.onlyWrong = false;
      if (mbFilterCat) mbFilterCat.value = 'all';
      if (mbFilterImp) mbFilterImp.value = 'all';
      if (mbFilterUnattempted) mbFilterUnattempted.checked = false;
      if (mbFilterWrong) mbFilterWrong.checked = false;
      prepareMarubatsuList();
      renderMarubatsuView();
    });
  }

  // --- キーボードショートカット (〇✕特訓対応) ---
  document.addEventListener('keydown', (e) => {
    if (state.currentTab === 'practice' && state.practiceSubMode === 'marubatsu') {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (!state.marubatsu.answered) {
        if (e.key === 'ArrowLeft' || e.key === '1') {
          e.preventDefault();
          handleMarubatsuAnswer(true);
        } else if (e.key === 'ArrowRight' || e.key === '2') {
          e.preventDefault();
          handleMarubatsuAnswer(false);
        }
      } else {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          nextMarubatsuQuestion();
        }
      }
    }
  });

  // ==========================================
  // 2. 本番模擬試験モード
  // ==========================================
  function generateMockExamQuestions() {
    // 消防試験研究センターの本番構成:
    // 法令: 15問
    // 物理化学: 10問
    // 性質消火: 10問
    // 合計: 35問
    const houreiAll = state.allQuestions.filter(q => q.category === '法令');
    const butsuAll = state.allQuestions.filter(q => q.category === '物理化学');
    const seikaAll = state.allQuestions.filter(q => q.category === '性質消火');

    const selectedHourei = shuffleArray(houreiAll).slice(0, 15);
    const selectedButsu = shuffleArray(butsuAll).slice(0, 10);
    const selectedSeika = shuffleArray(seikaAll).slice(0, 10);

    const full35 = [...selectedHourei, ...selectedButsu, ...selectedSeika];

    // 全問について選択肢をシャッフル
    return full35.map((q, idx) => {
      const shuffled = createShuffledQuestion(q, true);
      shuffled.examNumber = idx + 1;
      return shuffled;
    });
  }

  function startMockExam() {
    state.mock.status = 'running';
    state.mock.questions = generateMockExamQuestions();
    state.mock.currentIndex = 0;
    state.mock.userAnswers = {};
    state.mock.flagged = {};
    state.mock.timerSeconds = 120 * 60; // 120分
    state.mock.results = null;

    if (state.mock.timerInterval) clearInterval(state.mock.timerInterval);
    state.mock.timerInterval = setInterval(() => {
      state.mock.timerSeconds--;
      updateMockTimerDisplay();
      if (state.mock.timerSeconds <= 0) {
        clearInterval(state.mock.timerInterval);
        finishMockExam();
      }
    }, 1000);

    renderMockExamView();
  }

  function updateMockTimerDisplay() {
    const timerEl = document.getElementById('mock-timer-display');
    if (!timerEl) return;
    timerEl.textContent = formatTime(state.mock.timerSeconds);
    if (state.mock.timerSeconds <= 600) { // 残り10分で赤色点滅
      timerEl.classList.add('timer-warning');
    } else {
      timerEl.classList.remove('timer-warning');
    }
  }

  function renderMockExamView() {
    const welcomeCard = document.getElementById('mock-welcome-card');
    const examRunningCard = document.getElementById('mock-running-card');
    const resultCard = document.getElementById('mock-result-card');

    if (state.mock.status === 'idle') {
      welcomeCard.classList.remove('hidden');
      examRunningCard.classList.add('hidden');
      resultCard.classList.add('hidden');
      return;
    }

    if (state.mock.status === 'finished') {
      welcomeCard.classList.add('hidden');
      examRunningCard.classList.add('hidden');
      resultCard.classList.remove('hidden');
      renderMockResultView();
      return;
    }

    // 実行中
    welcomeCard.classList.add('hidden');
    examRunningCard.classList.remove('hidden');
    resultCard.classList.add('hidden');

    const q = state.mock.questions[state.mock.currentIndex];
    const total = state.mock.questions.length;
    const answeredCount = Object.keys(state.mock.userAnswers).length;

    // 進捗率と設問番号
    document.getElementById('mock-q-current-num').textContent = state.mock.currentIndex + 1;
    document.getElementById('mock-progress-bar').style.width = `${(answeredCount / total) * 100}%`;
    document.getElementById('mock-answered-stat').textContent = `${answeredCount} / ${total} 問回答済`;

    // 科目バッジ
    document.getElementById('mock-q-cat-badge').textContent = q.category;
    document.getElementById('mock-q-subcat-badge').textContent = q.subCategory;

    // 見直しフラグ
    const isFlagged = !!state.mock.flagged[state.mock.currentIndex];
    const flagBtn = document.getElementById('mock-flag-btn');
    flagBtn.className = `px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border transition-all ${
      isFlagged ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
    }`;
    flagBtn.innerHTML = isFlagged 
      ? `<svg class="w-4 h-4 text-amber-600 fill-amber-600" viewBox="0 0 20 20"><path d="M3 3a1 1 0 011-1h12a1 1 0 01.8 1.6L13.5 8l3.3 4.4a1 1 0 01-.8 1.6H4v3a1 1 0 11-2 0V3z"/></svg><span>要見直し済</span>`
      : `<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/></svg><span>あとで見直す</span>`;

    // 問題文
    document.getElementById('mock-q-text').textContent = `［問 ${state.mock.currentIndex + 1}］ ${q.question}`;

    // 選択肢
    const optionsContainer = document.getElementById('mock-options-container');
    optionsContainer.innerHTML = '';
    const userSelected = state.mock.userAnswers[state.mock.currentIndex];

    q.displayOptions.forEach((optText, optIdx) => {
      const isSelected = (userSelected === optIdx);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `option-btn w-full text-left p-3.5 sm:p-4 rounded-xl border text-sm sm:text-base font-medium flex items-start space-x-3 transition-all ${
        isSelected 
          ? 'border-sky-600 bg-sky-50 text-sky-950 font-semibold ring-2 ring-sky-500' 
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
      }`;
      btn.innerHTML = `
        <span class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${isSelected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}">${optIdx + 1}</span>
        <span class="pt-0.5 leading-relaxed break-words flex-1">${optText}</span>
      `;
      btn.addEventListener('click', () => {
        state.mock.userAnswers[state.mock.currentIndex] = optIdx;
        renderMockExamView();
      });
      optionsContainer.appendChild(btn);
    });

    // ナビゲーターパレット描画 (1〜35のグリッド)
    renderMockNavGrid();

    // ナビボタン
    document.getElementById('mock-btn-prev').disabled = (state.mock.currentIndex === 0);
    document.getElementById('mock-btn-next').disabled = (state.mock.currentIndex >= total - 1);
  }

  function renderMockNavGrid() {
    const grid = document.getElementById('mock-nav-grid');
    if (!grid) return;
    grid.innerHTML = '';

    state.mock.questions.forEach((q, idx) => {
      const isCurrent = (idx === state.mock.currentIndex);
      const isAnswered = (state.mock.userAnswers[idx] !== undefined);
      const isFlagged = !!state.mock.flagged[idx];

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `h-9 rounded-lg text-xs font-bold transition-all flex items-center justify-center relative `;

      if (isCurrent) {
        chip.className += 'ring-2 ring-sky-600 ring-offset-2 z-10 ';
      }

      if (isAnswered) {
        chip.className += 'bg-sky-600 text-white hover:bg-sky-700';
      } else {
        chip.className += 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200';
      }

      chip.textContent = `${idx + 1}`;

      // 見直しフラグバッジ
      if (isFlagged) {
        const flagDot = document.createElement('span');
        flagDot.className = 'absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white';
        chip.appendChild(flagDot);
      }

      chip.addEventListener('click', () => {
        state.mock.currentIndex = idx;
        renderMockExamView();
      });
      grid.appendChild(chip);
    });
  }

  // 模擬試験の操作イベント
  document.getElementById('btn-start-mock').addEventListener('click', startMockExam);
  
  document.getElementById('mock-flag-btn').addEventListener('click', () => {
    state.mock.flagged[state.mock.currentIndex] = !state.mock.flagged[state.mock.currentIndex];
    renderMockExamView();
  });

  document.getElementById('mock-btn-prev').addEventListener('click', () => {
    if (state.mock.currentIndex > 0) {
      state.mock.currentIndex--;
      renderMockExamView();
    }
  });

  document.getElementById('mock-btn-next').addEventListener('click', () => {
    if (state.mock.currentIndex < state.mock.questions.length - 1) {
      state.mock.currentIndex++;
      renderMockExamView();
    }
  });

  document.getElementById('btn-submit-mock').addEventListener('click', () => {
    const unanswered = state.mock.questions.length - Object.keys(state.mock.userAnswers).length;
    let msg = '模擬試験を提出して採点しますか？';
    if (unanswered > 0) {
      msg = `未回答の問題が ${unanswered} 問あります！\nこのまま提出して採点しますか？`;
    }
    if (confirm(msg)) {
      if (state.mock.timerInterval) clearInterval(state.mock.timerInterval);
      finishMockExam();
    }
  });

  function finishMockExam() {
    state.mock.status = 'finished';

    // 採点計算
    // 科目別要件: 法令15問中9問(60%)、物理化学10問中6問(60%)、性質消火10問中6問(60%)
    let scoreTotal = 0;
    const catScores = {
      '法令': { correct: 0, total: 15, passReq: 9 },
      '物理化学': { correct: 0, total: 10, passReq: 6 },
      '性質消火': { correct: 0, total: 10, passReq: 6 }
    };

    const reviewItems = state.mock.questions.map((q, idx) => {
      const userAns = state.mock.userAnswers[idx];
      const isCorrect = (userAns !== undefined && userAns === q.correctDisplayIndex);
      if (isCorrect) {
        scoreTotal++;
        catScores[q.category].correct++;
      }

      // 本番模試で解いた問題（回答済みの問題）の実績を学習履歴・達成状況に反映
      if (userAns !== undefined) {
        if (!state.userData.history[q.id]) {
          state.userData.history[q.id] = { attempts: 0, correct: 0, lastAnswered: Date.now() };
        }
        state.userData.history[q.id].attempts++;
        if (isCorrect) {
          state.userData.history[q.id].correct++;
        }
        state.userData.history[q.id].lastAnswered = Date.now();
      }

      return {
        ...q,
        index: idx,
        userSelected: userAns,
        isCorrect
      };
    });

    const passedHourei = (catScores['法令'].correct >= catScores['法令'].passReq);
    const passedButsu = (catScores['物理化学'].correct >= catScores['物理化学'].passReq);
    const passedSeika = (catScores['性質消火'].correct >= catScores['性質消火'].passReq);
    const isOverallPass = (passedHourei && passedButsu && passedSeika);

    const results = {
      scoreTotal,
      totalCount: state.mock.questions.length,
      catScores,
      passedHourei,
      passedButsu,
      passedSeika,
      isOverallPass,
      timeTakenSeconds: (120 * 60) - state.mock.timerSeconds,
      reviewItems
    };

    state.mock.results = results;

    // 履歴保存
    state.userData.mockHistory.push({
      date: new Date().toLocaleDateString('ja-JP'),
      score: scoreTotal,
      total: 35,
      isPassed: isOverallPass,
      catScores: {
        '法令': `${catScores['法令'].correct}/15`,
        '物理化学': `${catScores['物理化学'].correct}/10`,
        '性質消火': `${catScores['性質消火'].correct}/10`
      }
    });
    saveUserData();

    renderMockExamView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderMockResultView() {
    const welcomeCard = document.getElementById('mock-welcome-card');
    const examRunningCard = document.getElementById('mock-running-card');
    const resultCard = document.getElementById('mock-result-card');
    if (welcomeCard) welcomeCard.classList.add('hidden');
    if (examRunningCard) examRunningCard.classList.add('hidden');
    if (resultCard) resultCard.classList.remove('hidden');

    const res = state.mock.results;
    if (!res) return;

    const banner = document.getElementById('mock-result-status-banner');
    if (res.isOverallPass) {
      banner.className = 'p-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-center shadow-lg';
      banner.innerHTML = `
        <div class="inline-flex p-3 bg-white/20 rounded-full mb-3">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h2 class="text-3xl font-extrabold mb-1">合格水準に到達しています！</h2>
        <p class="text-emerald-100 text-sm">全3科目ですべて合格ライン（正答率60％以上）を達成しました！素晴らしい成果です。</p>
      `;
    } else {
      const failedSubjects = [];
      if (!res.passedHourei) failedSubjects.push(`法令 (${res.catScores['法令'].correct}/15)`);
      if (!res.passedButsu) failedSubjects.push(`物理・化学 (${res.catScores['物理化学'].correct}/10)`);
      if (!res.passedSeika) failedSubjects.push(`性質・消火 (${res.catScores['性質消火'].correct}/10)`);

      banner.className = 'p-6 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-600 text-white text-center shadow-lg';
      banner.innerHTML = `
        <div class="inline-flex p-3 bg-white/20 rounded-full mb-3">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        </div>
        <h2 class="text-3xl font-extrabold mb-1">今回は不合格ラインです</h2>
        <p class="text-rose-100 text-sm mb-2">危険物試験は【3科目すべてで60％以上の正答】が必須条件となります。</p>
        <span class="inline-block px-3 py-1 bg-black/20 rounded-full text-xs font-semibold">足切り対象科目: ${failedSubjects.join(', ')}</span>
      `;
    }

    // スコア数字
    document.getElementById('mock-total-score-display').textContent = `${res.scoreTotal} / 35`;
    document.getElementById('mock-time-taken-display').textContent = formatTime(res.timeTakenSeconds);

    // 科目別バー
    renderCatScoreCard('cat-score-hourei', '法令 (15問)', res.catScores['法令'].correct, 15, 9);
    renderCatScoreCard('cat-score-butsu', '物理・化学 (10問)', res.catScores['物理化学'].correct, 10, 6);
    renderCatScoreCard('cat-score-seika', '性質・消火 (10問)', res.catScores['性質消火'].correct, 10, 6);

    // 詳細解答レビューリスト
    renderMockReviewList(res.reviewItems);
  }

  function renderCatScoreCard(elementId, title, correct, total, passReq) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const pct = Math.round((correct / total) * 100);
    const isPass = (correct >= passReq);
    el.innerHTML = `
      <div class="flex justify-between items-center mb-1">
        <span class="font-bold text-sm text-slate-800">${title}</span>
        <span class="text-xs font-bold ${isPass ? 'text-emerald-600' : 'text-rose-600'}">${isPass ? '合格' : '足切り'} (${pct}%)</span>
      </div>
      <div class="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden mb-1">
        <div class="h-full rounded-full transition-all ${isPass ? 'bg-emerald-500' : 'bg-rose-500'}" style="width: ${pct}%"></div>
      </div>
      <div class="flex justify-between text-xs text-slate-500">
        <span>正解: ${correct} / ${total} 問</span>
        <span>合格基準: ${passReq}問以上 (60%)</span>
      </div>
    `;
  }

  function renderMockReviewList(items) {
    const container = document.getElementById('mock-review-container');
    if (!container) return;
    container.innerHTML = '';

    items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `p-5 rounded-2xl border mb-4 bg-white transition-all ${
        item.isCorrect ? 'border-slate-200' : 'border-rose-200 bg-rose-50/20'
      }`;

      const correctAnsText = item.displayOptions[item.correctDisplayIndex];
      const userAnsText = item.userSelected !== undefined ? item.displayOptions[item.userSelected] : '未回答';
      const chInfo = SUBCATEGORY_TO_CHAPTER[item.subCategory];

      card.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center space-x-2">
            <span class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
              item.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }">${item.isCorrect ? '○' : '✕'}</span>
            <span class="font-bold text-slate-800">問 ${idx + 1}</span>
            <span class="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600">${item.category} / ${item.subCategory}</span>
          </div>
          <span class="text-xs ${item.importance === 3 ? 'text-rose-600 font-bold' : 'text-slate-500'}">
            ${item.importance === 3 ? '★★★ 超頻出' : item.importance === 2 ? '★★☆ 頻出' : '★☆☆ 重要'}
          </span>
        </div>
        <p class="text-sm font-semibold text-slate-900 mb-3 leading-relaxed">${item.question}</p>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-3">
          <div class="p-2.5 rounded-lg ${item.isCorrect ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}">
            <span class="font-bold">あなたの回答:</span> 肢${item.userSelected !== undefined ? (item.userSelected + 1) : '-'} (${userAnsText})
          </div>
          <div class="p-2.5 rounded-lg bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200">
            <span class="font-bold text-emerald-700">正解:</span> 肢${item.correctDisplayIndex + 1} (${correctAnsText})
          </div>
        </div>

        <div class="p-3.5 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-200/80 leading-relaxed">
          <strong class="text-slate-900 block mb-1">【解説】</strong>
          ${formatExplanationText(item.explanation, item.correctDisplayIndex, item.displayOptions)}
          ${chInfo ? `
            <div class="mt-3 pt-2.5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span class="text-[11px] text-slate-500">関連テキスト: <strong class="text-slate-700">${chInfo.part} ${chInfo.title}</strong></span>
              <button type="button" onclick="window.jumpToTextbookChapter('${chInfo.chapterId}')" class="px-3 py-1.5 bg-white hover:bg-sky-600 hover:text-white text-sky-700 border border-sky-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center space-x-1 shrink-0 self-end sm:self-auto cursor-pointer">
                <span>📖 要点テキストで復習</span>
                <span>→</span>
              </button>
            </div>
          ` : ''}
        </div>
      `;
      container.appendChild(card);
    });
  }

  document.getElementById('btn-restart-mock').addEventListener('click', () => {
    state.mock.status = 'idle';
    renderMockExamView();
  });

  // ==========================================
  // 3. 要点テキストモード
  // ==========================================
  function renderTextbookView() {
    const navContainer = document.getElementById('textbook-nav-tabs');
    const contentContainer = document.getElementById('textbook-content-area');
    const mobileSelect = document.getElementById('mobile-textbook-select');
    if (!navContainer || !contentContainer) return;

    navContainer.innerHTML = '';
    contentContainer.innerHTML = '';
    if (mobileSelect) mobileSelect.innerHTML = '';

    state.textbookData.forEach((part, partIdx) => {
      // 編コンテナ
      const partSection = document.createElement('div');
      partSection.className = 'mb-12';
      partSection.id = part.id;

      const partHeader = document.createElement('div');
      partHeader.className = 'flex items-center space-x-3 mb-6 pb-3 border-b-2 border-slate-200 scroll-mt-20';
      partHeader.innerHTML = `
        <span class="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-sky-100 text-sky-800">${part.part}</span>
        <h2 class="text-2xl font-bold text-slate-900">${part.title}</h2>
      `;
      partSection.appendChild(partHeader);

      // 各章
      part.chapters.forEach(ch => {
        const chCard = document.createElement('div');
        chCard.id = ch.id;
        chCard.className = 'p-6 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6 scroll-mt-20 transition-all';

        // この章に対応する問題数を集計
        const targetSubcats = CHAPTER_TO_SUBCATEGORIES[ch.id] || [];
        const qCount = state.allQuestions.filter(q => targetSubcats.includes(q.subCategory)).length;

        chCard.innerHTML = `
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
            <h3 class="text-xl font-extrabold text-slate-900">${ch.title}</h3>
            <span class="text-xs font-bold px-3 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 self-start sm:self-auto shadow-xs">
              過去問演習: 全 ${qCount} 問
            </span>
          </div>
          <p class="text-xs text-slate-500 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">${ch.summary}</p>
          <div class="textbook-prose leading-relaxed">${renderMarkdownSimple(ch.content)}</div>

          <!-- この章の問題を解くアクションボックス -->
          <div class="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-sky-50 to-indigo-50/70 p-4 rounded-xl border border-sky-100">
            <div>
              <span class="text-xs font-bold text-sky-800 block mb-0.5">知識の定着チェック</span>
              <p class="text-xs text-slate-600">この章（${ch.title}）から厳選された過去問 ${qCount}問に挑戦できます</p>
            </div>
            <button type="button" onclick="window.startChapterPractice('${ch.id}')" class="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/25 transition-all flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer">
              <span>✍️ この章の問題を解く (${qCount}問)</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </button>
          </div>
        `;
        partSection.appendChild(chCard);
      });

      contentContainer.appendChild(partSection);

      // PCサイドバー ナビゲーションリンク
      const navGroup = document.createElement('div');
      navGroup.className = 'mb-3.5';

      const navPartHeader = document.createElement('a');
      navPartHeader.href = `#${part.id}`;
      navPartHeader.className = 'block px-3 py-2 rounded-xl text-xs font-bold text-slate-900 hover:text-sky-600 hover:bg-sky-50 transition-all';
      navPartHeader.textContent = `${part.part}: ${part.title}`;
      navGroup.appendChild(navPartHeader);

      const chList = document.createElement('div');
      chList.className = 'pl-2 space-y-0.5 mt-1 border-l-2 border-slate-100';
      part.chapters.forEach(ch => {
        const chLink = document.createElement('a');
        chLink.href = `#${ch.id}`;
        chLink.className = 'block px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-sky-600 hover:underline transition-all truncate';
        chLink.textContent = ch.title;
        chList.appendChild(chLink);
      });
      navGroup.appendChild(chList);
      navContainer.appendChild(navGroup);

      // モバイル目次セレクトのグループ追加
      if (mobileSelect) {
        const optGroup = document.createElement('optgroup');
        optGroup.label = `${part.part}: ${part.title}`;
        part.chapters.forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = ch.title;
          optGroup.appendChild(opt);
        });
        mobileSelect.appendChild(optGroup);
      }
    });
  }

  function renderMarkdownSimple(md) {
    if (!md) return '';

    let processed = md;

    // 1. Callout Blocks (> [!TIP], > [!WARNING])
    processed = processed.replace(/> \[!TIP\]([\s\S]*?)(?=\n\n|\n###|\n---|$)/g, (match, content) => {
      const cleanContent = content.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n');
      return `<div class="callout-box callout-tip my-4 text-sm">${renderInnerMarkdown(cleanContent)}</div>`;
    });

    processed = processed.replace(/> \[!WARNING\]([\s\S]*?)(?=\n\n|\n###|\n---|$)/g, (match, content) => {
      const cleanContent = content.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n');
      return `<div class="callout-box callout-warning my-4 text-sm">${renderInnerMarkdown(cleanContent)}</div>`;
    });

    // 2. Marked.js による完全パース（利用可能な場合）
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      try {
        let html = marked.parse(processed);
        html = html.replace(/<table>/g, '<div class="textbook-table-wrapper"><table>');
        html = html.replace(/<\/table>/g, '</table></div>');
        return html;
      } catch (e) {
        console.warn('marked.js parse fallback:', e);
      }
    }

    // 3. フォールバック用パーサー（オフライン時もテーブル等を綺麗に整形）
    return fallbackMarkdownParser(processed);
  }

  function renderInnerMarkdown(txt) {
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      return marked.parse(txt);
    }
    return fallbackMarkdownParser(txt);
  }

  function fallbackMarkdownParser(md) {
    const lines = md.split('\n');
    let html = '';
    let inTable = false;
    let tableHeaderDone = false;
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // テーブル行の判定
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<div class="textbook-table-wrapper"><table>';
          inTable = true;
          tableHeaderDone = false;
        }

        // 区切り行 (| :--- | :--- |) はスキップ
        if (line.includes('---')) {
          tableHeaderDone = true;
          continue;
        }

        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        const tag = (!tableHeaderDone) ? 'th' : 'td';
        html += '<tr>' + cells.map(c => `<${tag}>${formatInline(c)}</${tag}>`).join('') + '</tr>';
        continue;
      } else if (inTable) {
        html += '</table></div>';
        inTable = false;
        tableHeaderDone = false;
      }

      // リスト行 (- )
      if (line.startsWith('- ') || line.startsWith('・')) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        const itemText = line.replace(/^[-・]\s?/, '');
        html += `<li>${formatInline(itemText)}</li>`;
        continue;
      } else if (inList) {
        html += '</ul>';
        inList = false;
      }

      // 空行
      if (!line) {
        continue;
      }

      // 見出し
      if (line.startsWith('### ')) {
        html += `<h3 class="font-bold text-slate-900 mt-6 mb-2 text-lg border-l-4 border-sky-600 pl-3">${formatInline(line.slice(4))}</h3>`;
      } else if (line.startsWith('#### ')) {
        html += `<h4 class="font-bold text-slate-800 mt-4 mb-2 text-base">${formatInline(line.slice(5))}</h4>`;
      } else if (line.startsWith('---')) {
        html += `<hr class="my-6 border-slate-200">`;
      } else if (line.startsWith('<div')) {
        html += line;
      } else {
        html += `<p class="mb-3 leading-relaxed">${formatInline(line)}</p>`;
      }
    }

    if (inTable) html += '</table></div>';
    if (inList) html += '</ul>';

    return html;
  }

  function formatInline(str) {
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-100 text-sky-700 text-xs font-mono">$1</code>');
  }

  // ==========================================
  // 4. 用語解説集モード
  // ==========================================
  function renderGlossaryView() {
    const container = document.getElementById('glossary-cards-container');
    const countEl = document.getElementById('glossary-result-count');
    if (!container) return;

    const query = state.glossary.searchQuery.trim().toLowerCase();
    const cat = state.glossary.category;

    const filtered = state.glossaryData.filter(item => {
      const matchCat = (cat === 'all' || item.category === cat);
      if (!matchCat) return false;
      if (!query) return true;
      return (
        item.term.toLowerCase().includes(query) ||
        item.reading.toLowerCase().includes(query) ||
        item.definition.toLowerCase().includes(query) ||
        (item.tip && item.tip.toLowerCase().includes(query))
      );
    });

    if (countEl) countEl.textContent = `${filtered.length} 件`;
    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-8 text-center bg-white rounded-2xl border border-slate-200">
          <p class="text-slate-500 font-medium">該当する用語が見つかりませんでした。</p>
          <p class="text-xs text-slate-400 mt-1">別のキーワードやカテゴリでお試しください。</p>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between';
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${
              item.category === '法令' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              item.category === '物理化学' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
              'bg-amber-50 text-amber-700 border border-amber-200'
            }">${item.category}</span>
            <span class="text-xs text-slate-400 font-mono">${item.reading}</span>
          </div>
          <h4 class="text-lg font-bold text-slate-900 mb-2">${item.term}</h4>
          <p class="text-xs text-slate-600 leading-relaxed mb-3">${item.definition}</p>
        </div>
        ${item.tip ? `
          <div class="pt-2 border-t border-slate-100 flex items-start space-x-1.5 text-xs text-amber-800 bg-amber-50/60 p-2 rounded-lg">
            <svg class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14H8a4 4 0 01-3.66-5.61A4.012 4.012 0 018 4h4a4.012 4.012 0 013.66 4.39A4 4 0 0112 14z"/></svg>
            <span>${item.tip}</span>
          </div>
        ` : ''}
      `;
      container.appendChild(card);
    });
  }

  // 用語集イベント
  document.getElementById('glossary-search-input').addEventListener('input', (e) => {
    state.glossary.searchQuery = e.target.value;
    renderGlossaryView();
  });

  document.querySelectorAll('.glossary-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.glossary-cat-btn').forEach(b => {
        b.classList.remove('bg-sky-600', 'text-white');
        b.classList.add('bg-slate-100', 'text-slate-600');
      });
      btn.classList.remove('bg-slate-100', 'text-slate-600');
      btn.classList.add('bg-sky-600', 'text-white');
      state.glossary.category = btn.dataset.cat;
      renderGlossaryView();
    });
  });

  // ==========================================
  // 5. 学習進捗・統計モード
  // ==========================================
  function renderStatsView() {
    const totalQ = state.allQuestions.length;
    let answeredQ = 0;
    let correctQ = 0;

    const catStats = {
      '法令': { total: 0, answered: 0, correct: 0 },
      '物理化学': { total: 0, answered: 0, correct: 0 },
      '性質消火': { total: 0, answered: 0, correct: 0 }
    };

    state.allQuestions.forEach(q => {
      if (catStats[q.category]) {
        catStats[q.category].total++;
      }
      const h = state.userData.history[q.id];
      if (h && h.attempts > 0) {
        answeredQ++;
        if (h.correct > 0) correctQ++;
        if (catStats[q.category]) {
          catStats[q.category].answered++;
          if (h.correct > 0) catStats[q.category].correct++;
        }
      }
    });

    const overallPct = answeredQ > 0 ? Math.round((correctQ / answeredQ) * 100) : 0;
    const progressPct = Math.round((answeredQ / totalQ) * 100);

    document.getElementById('stats-total-progress-pct').textContent = `${progressPct}%`;
    document.getElementById('stats-progress-bar').style.width = `${progressPct}%`;
    document.getElementById('stats-answered-count').textContent = `${answeredQ} / ${totalQ} 問`;
    document.getElementById('stats-accuracy-rate').textContent = `${overallPct}%`;
    document.getElementById('stats-bookmark-count').textContent = `${Object.values(state.userData.bookmarks).filter(Boolean).length} 問`;

    // 〇✕特訓の進捗表示
    const mbHist = state.userData.marubatsuHistory || {};
    const mbKeys = Object.keys(mbHist);
    let mbAnsCount = 0;
    let mbCorCount = 0;
    mbKeys.forEach(k => {
      if (mbHist[k].attempts > 0) {
        mbAnsCount++;
        if (mbHist[k].correct > 0) mbCorCount++;
      }
    });
    const mbPct = mbAnsCount > 0 ? Math.round((mbCorCount / mbAnsCount) * 100) : 0;
    const mbAnsEl = document.getElementById('stats-mb-answered-count');
    const mbAccEl = document.getElementById('stats-mb-accuracy-rate');
    const mbMaxEl = document.getElementById('stats-mb-max-streak');
    if (mbAnsEl) mbAnsEl.textContent = mbAnsCount;
    if (mbAccEl) mbAccEl.textContent = `${mbPct}%`;
    if (mbMaxEl) mbMaxEl.textContent = state.userData.marubatsuMaxStreak || 0;

    // カテゴリ別カード
    ['法令', '物理化学', '性質消火'].forEach(cat => {
      const s = catStats[cat];
      const elId = cat === '法令' ? 'stat-hourei' : cat === '物理化学' ? 'stat-butsu' : 'stat-seika';
      const catEl = document.getElementById(elId);
      if (catEl) {
        const catPct = s.answered > 0 ? Math.round((s.correct / s.answered) * 100) : 0;
        catEl.innerHTML = `
          <div class="flex justify-between items-center mb-1">
            <span class="font-bold text-sm text-slate-800">${cat}</span>
            <span class="text-xs font-semibold text-slate-600">${s.correct} / ${s.total} 問完了 (${catPct}%)</span>
          </div>
          <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div class="bg-sky-500 h-full rounded-full" style="width: ${(s.correct / s.total) * 100}%"></div>
          </div>
        `;
      }
    });

    // 模擬試験履歴テーブル
    const tbody = document.getElementById('stats-mock-history-table');
    if (tbody) {
      tbody.innerHTML = '';
      if (state.userData.mockHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-xs text-slate-400">模擬試験の受験履歴はまだありません</td></tr>`;
      } else {
        state.userData.mockHistory.slice().reverse().forEach((mh, i) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-100 hover:bg-slate-50';
          tr.innerHTML = `
            <td class="p-3 text-xs text-slate-600 font-mono">${mh.date}</td>
            <td class="p-3 text-xs font-bold ${mh.isPassed ? 'text-emerald-600' : 'text-rose-600'}">${mh.isPassed ? '合格' : '不合格'}</td>
            <td class="p-3 text-xs font-bold text-slate-800">${mh.score} / ${mh.total}</td>
            <td class="p-3 text-xs text-slate-500">法:${mh.catScores['法令']} 物:${mh.catScores['物理化学']} 性:${mh.catScores['性質消火']}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  }

  // データ初期化
  document.getElementById('btn-clear-stats').addEventListener('click', () => {
    if (confirm('すべての学習履歴とブックマークを初期化しますか？')) {
      localStorage.removeItem('otsu4_user_data_v1');
      state.userData = loadUserData();
      renderStatsView();
      alert('学習履歴をリセットしました。');
    }
  });

  // モバイル目次ジャンプのイベント連携
  const mobileTextbookSelect = document.getElementById('mobile-textbook-select');
  if (mobileTextbookSelect) {
    mobileTextbookSelect.addEventListener('change', (e) => {
      const target = document.getElementById(e.target.value);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // --- 初回初期化起動 ---
  preparePracticeQuestions();
  renderPracticeView();
  console.log(`乙種第4類学習アプリが正常に起動しました (全${state.allQuestions.length}問収録)`);
});
