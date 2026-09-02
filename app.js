const SRS_STORAGE_KEY = 'vocab_srs_records_v1';
const REVERSE_STORAGE_KEY = 'vocab_reverse_mode_v1';
const DAILY_STATS_KEY = 'vocab_daily_stats_v1';
const ACTIVE_DECK_KEY = 'vocab_active_deck_v1';

const INTERVAL_LADDER = [
  10 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000
];

const INTERVAL_LABELS = [
  '10m',
  '30m',
  '1h',
  '2h',
  '4h',
  '12h',
  '1d',
  '3d',
  '7d',
  '14d',
  '30d'
];

const DECK_FILES = {
  'step1_vocab1': 'step1_vocab1.json',
  'step2_vocab1': 'step2_vocab1.json',
  'step2_vocab2': 'step2_vocab2.json',
  'step2_vocab3': 'step2_vocab3.json'
};

let vocabData = [];
let queue = [];
let currentCard = null;
let showingAnswer = false;
let isReverseMode = false;
let activeDeckSelection = 'all';
let reviewHistory = [];

function getTodayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDailyReviewCount() {
  try {
    const raw = localStorage.getItem(DAILY_STATS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[getTodayKey()] || 0;
  } catch (e) {
    return 0;
  }
}

function incrementDailyReviewCount(delta = 1) {
  try {
    const raw = localStorage.getItem(DAILY_STATS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const key = getTodayKey();
    map[key] = Math.max(0, (map[key] || 0) + delta);
    localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(map));
  } catch (e) {}
}

function loadStoredReverseMode() {
  try {
    const saved = localStorage.getItem(REVERSE_STORAGE_KEY);
    if (saved !== null) {
      isReverseMode = JSON.parse(saved);
    }
  } catch (e) {}
  updateReverseButtonUI();
}

function updateReverseButtonUI() {
  const btn = document.getElementById('reverseToggleBtn');
  if (!btn) return;
  if (isReverseMode) {
    btn.textContent = '🔄 Mode: EN → JP';
    btn.classList.add('active-mode');
  } else {
    btn.textContent = '🔄 Mode: JP → EN';
    btn.classList.remove('active-mode');
  }
}

function toggleReverse() {
  isReverseMode = !isReverseMode;
  try {
    localStorage.setItem(REVERSE_STORAGE_KEY, JSON.stringify(isReverseMode));
  } catch (e) {}
  updateReverseButtonUI();
  if (currentCard) {
    renderCardContent();
  }
}

function getSRSMap() {
  try {
    const data = localStorage.getItem(SRS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
}

function saveSRSMap(map) {
  try {
    localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {}
}

function getCardId(card) {
  if (!card) return '';
  if (typeof card === 'string') return card;
  const term = (card.plain || card.rawSpeech || '').trim();
  const gloss = (card.english || '').trim();
  if (term || gloss) {
    return `${term}:::${gloss}`;
  }
  return String(card.id || '');
}

function getCardRecord(card) {
  const map = getSRSMap();
  const id = typeof card === 'string' ? card : getCardId(card);
  if (map[id]) {
    return map[id];
  }
  if (typeof card === 'object' && card !== null) {
    if (card.plain && map[card.plain]) {
      return map[card.plain];
    }
    if (card.id && map[String(card.id)]) {
      return map[String(card.id)];
    }
  }
  return {
    consecutiveGood: 0,
    intervalStage: 0,
    dueTime: 0,
    inReview: false
  };
}

function updateCardRecord(card, updates) {
  const map = getSRSMap();
  const id = typeof card === 'string' ? card : getCardId(card);
  const current = getCardRecord(card);
  map[id] = { ...current, ...updates };
  saveSRSMap(map);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isCardDue(card, now = Date.now()) {
  const rec = getCardRecord(card);
  if (!rec.inReview) return true;
  return rec.dueTime <= now;
}

function refreshDueQueue() {
  const now = Date.now();
  const currentId = currentCard ? getCardId(currentCard) : null;
  const inQueueIds = new Set(queue.map(c => getCardId(c)));
  if (currentId) inQueueIds.add(currentId);

  const dueCards = vocabData.filter(card => {
    const id = getCardId(card);
    if (inQueueIds.has(id)) return false;
    return isCardDue(card, now);
  });

  if (dueCards.length > 0) {
    queue.push(...shuffle(dueCards));
  }
}

function formatDuration(ms) {
  if (ms <= 0) return 'Now';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function updateStats() {
  const now = Date.now();
  let inReviewCount = 0;
  let nextDueTime = Infinity;
  let masteredCount = 0;

  vocabData.forEach(card => {
    const rec = getCardRecord(card);
    if (rec.inReview) {
      masteredCount++;
      if (rec.dueTime > now) {
        inReviewCount++;
        if (rec.dueTime < nextDueTime) {
          nextDueTime = rec.dueTime;
        }
      }
    }
  });

  const remainingCount = queue.length + (currentCard ? 1 : 0);
  const countRemainingEl = document.getElementById('countRemaining');
  const countReviewEl = document.getElementById('countReview');
  const countTotalEl = document.getElementById('countTotal');
  const nextDueEl = document.getElementById('nextDueTime');
  const dailyReviewCountEl = document.getElementById('countDaily');
  const progressBarFillEl = document.getElementById('progressBarFill');
  const progressTextEl = document.getElementById('progressText');

  if (countRemainingEl) countRemainingEl.textContent = remainingCount;
  if (countReviewEl) countReviewEl.textContent = inReviewCount;
  if (countTotalEl) countTotalEl.textContent = vocabData.length;
  if (dailyReviewCountEl) dailyReviewCountEl.textContent = getDailyReviewCount();

  if (progressBarFillEl && progressTextEl && vocabData.length > 0) {
    const percent = Math.round((masteredCount / vocabData.length) * 100);
    progressBarFillEl.style.width = `${percent}%`;
    progressTextEl.textContent = `${masteredCount} / ${vocabData.length} Mastered (${percent}%)`;
  }

  if (nextDueEl) {
    if (nextDueTime !== Infinity) {
      nextDueEl.textContent = formatDuration(nextDueTime - now);
    } else {
      nextDueEl.textContent = '--';
    }
  }

  const emptyCountdownEl = document.getElementById('countdownTimer');
  if (emptyCountdownEl) {
    if (nextDueTime !== Infinity) {
      emptyCountdownEl.textContent = formatDuration(nextDueTime - now);
    } else {
      emptyCountdownEl.textContent = 'All Mastered';
    }
  }
}

function renderCardContent() {
  if (!currentCard) return;

  const rec = getCardRecord(currentCard);
  const streakEl = document.getElementById('cardStreak');
  const termEl = document.getElementById('cardTerm');
  const englishEl = document.getElementById('cardEnglish');
  const defEl = document.getElementById('cardDefinition');
  const categoryEl = document.getElementById('cardCategory');

  if (streakEl) streakEl.textContent = `${rec.consecutiveGood}/2 ✓`;
  if (categoryEl) {
    categoryEl.textContent = isReverseMode ? 'IT & WORK (EN → JP)' : 'IT & WORK (JP → EN)';
  }

  if (!showingAnswer) {
    if (isReverseMode) {
      termEl.textContent = currentCard.english;
    } else {
      termEl.textContent = currentCard.plain;
    }
  } else {
    if (isReverseMode) {
      termEl.textContent = currentCard.english;
      englishEl.innerHTML = currentCard.ruby;
      defEl.innerHTML = currentCard.def;
    } else {
      termEl.innerHTML = currentCard.ruby;
      englishEl.textContent = currentCard.english;
      defEl.innerHTML = currentCard.def;
    }
  }
}

function loadNextCard() {
  showingAnswer = false;
  const ansSec = document.getElementById('answerSection');
  const showBtn = document.getElementById('showAnswerBtn');
  const gradeBtns = document.getElementById('gradeButtons');

  if (ansSec) ansSec.style.display = 'none';
  if (showBtn) showBtn.style.display = 'block';
  if (gradeBtns) gradeBtns.style.display = 'none';

  refreshDueQueue();

  if (queue.length === 0) {
    currentCard = null;
    updateStats();
    showCompletedState();
    return;
  }

  currentCard = queue.shift();
  updateStats();

  const deckContainer = document.getElementById('deckContainer');
  deckContainer.innerHTML = `
    <div class="flashcard" id="flashcard">
      <div class="card-top">
        <div class="card-top-left">
          <span class="category-badge" id="cardCategory">IT &amp; WORK</span>
          <span class="streak-badge" id="cardStreak">0/2 ✓</span>
        </div>
        <button class="tts-btn" onclick="playAudio()" title="Pronounce (Japanese)">🔊</button>
      </div>

      <div class="card-content">
        <div class="main-term" id="cardTerm">...</div>

        <div class="answer-section" id="answerSection" style="display: none;">
          <div class="divider"></div>
          <div class="english-gloss" id="cardEnglish">...</div>
          <div class="japanese-def" id="cardDefinition">...</div>
        </div>
      </div>
    </div>
  `;

  renderCardContent();
}

function showAnswer() {
  if (!currentCard || showingAnswer) return;
  showingAnswer = true;

  renderCardContent();

  const rec = getCardRecord(currentCard);
  const goodLabel = document.getElementById('goodIntervalLabel');

  if (goodLabel) {
    if (rec.consecutiveGood === 0) {
      goodLabel.textContent = '+1 Streak (1/2)';
    } else {
      const nextIntervalLabel = INTERVAL_LABELS[rec.intervalStage] || '30d';
      goodLabel.textContent = `2/2 Review → ${nextIntervalLabel}`;
    }
  }

  const ansSec = document.getElementById('answerSection');
  const showBtn = document.getElementById('showAnswerBtn');
  const gradeBtns = document.getElementById('gradeButtons');

  if (ansSec) ansSec.style.display = 'flex';
  if (showBtn) showBtn.style.display = 'none';
  if (gradeBtns) gradeBtns.style.display = 'grid';

  if (isReverseMode) {
    playAudio();
  }
}

function handleGrade(action) {
  if (!currentCard || !showingAnswer) return;

  const prevRecord = { ...getCardRecord(currentCard) };
  const prevQueue = [...queue];
  const ratedCard = currentCard;

  reviewHistory.push({
    card: ratedCard,
    prevRecord,
    prevQueue,
    action
  });
  if (reviewHistory.length > 30) {
    reviewHistory.shift();
  }

  const rec = getCardRecord(currentCard);
  incrementDailyReviewCount(1);

  if (action === 'again') {
    rec.consecutiveGood = 0;
    updateCardRecord(currentCard, rec);

    if (queue.length === 0) {
      queue.push(currentCard);
    } else {
      const minOffset = 1;
      const maxOffset = Math.min(queue.length, 4);
      const randomOffset = Math.floor(Math.random() * (maxOffset - minOffset + 1)) + minOffset;
      queue.splice(randomOffset, 0, currentCard);
    }
  } else if (action === 'good') {
    if (rec.consecutiveGood === 0) {
      rec.consecutiveGood = 1;
      updateCardRecord(currentCard, rec);

      if (queue.length === 0) {
        queue.push(currentCard);
      } else {
        const minOffset = 1;
        const maxOffset = Math.min(queue.length, 4);
        const randomOffset = Math.floor(Math.random() * (maxOffset - minOffset + 1)) + minOffset;
        queue.splice(randomOffset, 0, currentCard);
      }
    } else {
      const intervalMs = INTERVAL_LADDER[rec.intervalStage] || (30 * 24 * 60 * 60 * 1000);
      rec.consecutiveGood = 0;
      rec.inReview = true;
      rec.dueTime = Date.now() + intervalMs;
      rec.intervalStage = Math.min(rec.intervalStage + 1, INTERVAL_LADDER.length - 1);
      updateCardRecord(currentCard, rec);
    }
  }

  loadNextCard();
}

function handleUndo() {
  if (reviewHistory.length === 0) {
    alert('No review actions to undo.');
    return;
  }

  const lastAction = reviewHistory.pop();
  const card = lastAction.card;
  const prevRecord = lastAction.prevRecord;
  const prevQueue = lastAction.prevQueue;

  updateCardRecord(card, prevRecord);
  incrementDailyReviewCount(-1);

  queue = prevQueue;
  currentCard = card;
  showingAnswer = true;

  const deckContainer = document.getElementById('deckContainer');
  deckContainer.innerHTML = `
    <div class="flashcard" id="flashcard">
      <div class="card-top">
        <div class="card-top-left">
          <span class="category-badge" id="cardCategory">IT &amp; WORK</span>
          <span class="streak-badge" id="cardStreak">0/2 ✓</span>
        </div>
        <button class="tts-btn" onclick="playAudio()" title="Pronounce (Japanese)">🔊</button>
      </div>

      <div class="card-content">
        <div class="main-term" id="cardTerm">...</div>

        <div class="answer-section" id="answerSection">
          <div class="divider"></div>
          <div class="english-gloss" id="cardEnglish">...</div>
          <div class="japanese-def" id="cardDefinition">...</div>
        </div>
      </div>
    </div>
  `;

  renderCardContent();

  const goodLabel = document.getElementById('goodIntervalLabel');
  if (goodLabel) {
    if (prevRecord.consecutiveGood === 0) {
      goodLabel.textContent = '+1 Streak (1/2)';
    } else {
      const nextIntervalLabel = INTERVAL_LABELS[prevRecord.intervalStage] || '30d';
      goodLabel.textContent = `2/2 Review → ${nextIntervalLabel}`;
    }
  }

  const showBtn = document.getElementById('showAnswerBtn');
  const gradeBtns = document.getElementById('gradeButtons');
  if (showBtn) showBtn.style.display = 'none';
  if (gradeBtns) gradeBtns.style.display = 'grid';

  updateStats();
}

function showCompletedState() {
  const deckContainer = document.getElementById('deckContainer');
  deckContainer.innerHTML = `
    <div class="flashcard empty-state">
      <h2>🎉 All Caught Up!</h2>
      <p style="color: var(--text-sub); max-width: 420px; line-height: 1.6;">
        All active flashcards are completed and scheduled for review.
      </p>
      <div class="countdown-box">
        <span style="font-size: 0.85rem; color: var(--text-sub);">Next Review Due In:</span>
        <div id="countdownTimer" style="font-size: 2.2rem; font-weight: 800; color: var(--accent);">--</div>
      </div>
    </div>
  `;
  const showBtn = document.getElementById('showAnswerBtn');
  const gradeBtns = document.getElementById('gradeButtons');
  if (showBtn) showBtn.style.display = 'none';
  if (gradeBtns) gradeBtns.style.display = 'none';
}

function playAudio() {
  if (!currentCard) return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentCard.rawSpeech || currentCard.plain);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}

function mergeIntoDeck(newCards) {
  const cardMap = new Map();
  vocabData.forEach(c => {
    const id = getCardId(c);
    if (id) cardMap.set(id, c);
  });

  let addedCount = 0;
  newCards.forEach(c => {
    const id = getCardId(c);
    if (id) {
      if (!cardMap.has(id)) {
        addedCount++;
      }
      cardMap.set(id, c);
    }
  });

  vocabData = Array.from(cardMap.values());
  return addedCount;
}

function handleFileImport(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  let totalFiles = files.length;
  let processedFiles = 0;
  let totalNewCards = 0;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let raw = (e.target.result || '').replace(/^\uFEFF/, '').trim();
        let parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          if (parsed.cards && Array.isArray(parsed.cards)) parsed = parsed.cards;
          else if (parsed.vocab && Array.isArray(parsed.vocab)) parsed = parsed.vocab;
          else if (parsed.data && Array.isArray(parsed.data)) parsed = parsed.data;
          else if (parsed.items && Array.isArray(parsed.items)) parsed = parsed.items;
          else if (parsed.vocabulary && Array.isArray(parsed.vocabulary)) parsed = parsed.vocabulary;
        }
        if (Array.isArray(parsed) && parsed.length > 0) {
          const added = mergeIntoDeck(parsed);
          totalNewCards += added;
        }
      } catch (err) {
        alert('Error parsing ' + file.name + ': ' + (err && err.message ? err.message : String(err)));
      } finally {
        processedFiles++;
        if (processedFiles === totalFiles) {
          if (event.target) event.target.value = '';
          try {
            localStorage.setItem('vocab_cached_custom_deck', JSON.stringify(vocabData));
          } catch (e) {}
          refreshDueQueue();
          updateStats();
          if (!currentCard && queue.length > 0) {
            loadNextCard();
          }
        }
      }
    };
    reader.readAsText(file, 'UTF-8');
  });
}

function clearDeckData() {
  if (!confirm('Reset all review progress and start fresh?')) return;
  queue = [];
  currentCard = null;
  reviewHistory = [];
  try {
    localStorage.removeItem(SRS_STORAGE_KEY);
    localStorage.removeItem(DAILY_STATS_KEY);
  } catch (e) {}
  loadSelectedDeck(activeDeckSelection);
}

async function loadSelectedDeck(deckKey) {
  activeDeckSelection = deckKey;
  try {
    localStorage.setItem(ACTIVE_DECK_KEY, deckKey);
  } catch (e) {}

  const selectEl = document.getElementById('deckSelect');
  if (selectEl) selectEl.value = deckKey;

  vocabData = [];
  queue = [];
  currentCard = null;
  reviewHistory = [];

  try {
    if (deckKey === 'all') {
      const keys = Object.keys(DECK_FILES);
      for (const k of keys) {
        try {
          const res = await fetch(DECK_FILES[k]);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) mergeIntoDeck(data);
          }
        } catch (e) {}
      }
    } else if (DECK_FILES[deckKey]) {
      const res = await fetch(DECK_FILES[deckKey]);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) mergeIntoDeck(data);
      }
    } else if (deckKey === 'custom') {
      const cached = localStorage.getItem('vocab_cached_custom_deck');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) mergeIntoDeck(parsed);
      }
    }
  } catch (e) {}

  if (vocabData.length === 0) {
    const cached = localStorage.getItem('vocab_cached_custom_deck');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) mergeIntoDeck(parsed);
      } catch (e) {}
    }
  }

  refreshDueQueue();
  updateStats();
  if (queue.length > 0) {
    loadNextCard();
  } else if (vocabData.length === 0) {
    showEmptyImportPrompt();
  } else {
    showCompletedState();
  }
}

function showEmptyImportPrompt() {
  const deckContainer = document.getElementById('deckContainer');
  deckContainer.innerHTML = `
    <div class="flashcard empty-state">
      <h2>📂 Load Vocabulary Deck</h2>
      <p style="color: var(--text-sub); max-width: 420px; line-height: 1.6;">
        Choose a built-in deck from the top dropdown or import your JSON file.
      </p>
      <label class="action-btn" style="margin-top: 12px; cursor: pointer; padding: 12px 20px; font-size: 1rem; background: var(--primary);">
        📁 Import JSON File(s)
        <input type="file" accept=".json" multiple style="display: none;" onchange="handleFileImport(event)" />
      </label>
    </div>
  `;
  const showBtn = document.getElementById('showAnswerBtn');
  const gradeBtns = document.getElementById('gradeButtons');
  if (showBtn) showBtn.style.display = 'none';
  if (gradeBtns) gradeBtns.style.display = 'none';
}

function exportProgressBackup() {
  const backupData = {
    version: 1,
    exportDate: new Date().toISOString(),
    srsRecords: getSRSMap(),
    dailyStats: JSON.parse(localStorage.getItem(DAILY_STATS_KEY) || '{}'),
    reverseMode: isReverseMode,
    activeDeck: activeDeckSelection,
    customCards: JSON.parse(localStorage.getItem('vocab_cached_custom_deck') || '[]')
  };

  const str = JSON.stringify(backupData, null, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `anki_backup_${getTodayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importProgressBackup(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const raw = (e.target.result || '').replace(/^\uFEFF/, '').trim();
      const backup = JSON.parse(raw);

      if (backup.srsRecords) {
        saveSRSMap(backup.srsRecords);
      }
      if (backup.dailyStats) {
        localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(backup.dailyStats));
      }
      if (backup.reverseMode !== undefined) {
        isReverseMode = backup.reverseMode;
        localStorage.setItem(REVERSE_STORAGE_KEY, JSON.stringify(isReverseMode));
        updateReverseButtonUI();
      }
      if (backup.customCards && Array.isArray(backup.customCards) && backup.customCards.length > 0) {
        localStorage.setItem('vocab_cached_custom_deck', JSON.stringify(backup.customCards));
      }

      alert('Progress restored successfully!');
      closeSyncModal();
      loadSelectedDeck(backup.activeDeck || activeDeckSelection);
    } catch (err) {
      alert('Failed to restore backup: ' + (err && err.message ? err.message : String(err)));
    } finally {
      if (event.target) event.target.value = '';
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function openSyncModal() {
  const modal = document.getElementById('syncModal');
  if (modal) modal.style.display = 'flex';
}

function closeSyncModal() {
  const modal = document.getElementById('syncModal');
  if (modal) modal.style.display = 'none';
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey || !showingAnswer || showingAnswer)) {
    if (reviewHistory.length > 0) {
      e.preventDefault();
      handleUndo();
      return;
    }
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (!showingAnswer && currentCard) {
      showAnswer();
    } else if (showingAnswer && currentCard) {
      handleGrade('again');
    }
  } else if (e.code === 'Enter' || e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    if (showingAnswer && currentCard) {
      handleGrade('good');
    }
  } else if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    if (showingAnswer && currentCard) {
      handleGrade('again');
    }
  } else if (e.key === 'r' || e.key === 'R') {
    playAudio();
  }
});

setInterval(() => {
  updateStats();
  if (!currentCard && vocabData.length > 0) {
    refreshDueQueue();
    if (queue.length > 0) {
      loadNextCard();
    }
  }
}, 1000);

window.addEventListener('DOMContentLoaded', () => {
  loadStoredReverseMode();
  const savedDeck = localStorage.getItem(ACTIVE_DECK_KEY) || 'all';
  loadSelectedDeck(savedDeck);
});
