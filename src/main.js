let parsedResult = [];
let currentSimIdx = 0;
let simShowBack = false;
let isGenerating = false;

function loadAiConfig() {
  const provider = localStorage.getItem('kaishi_gen_provider') || 'zero-key';
  const apiKey = localStorage.getItem('kaishi_gen_key') || '';
  let model = localStorage.getItem('kaishi_gen_model') || 'gemini-3.8-flash';
  if (model === 'gemini-1.5-flash' || model === 'gemini-2.0-flash' || model === 'gemini-3.5-flash') model = 'gemini-3.8-flash';
  
  const providerEl = document.getElementById('genProviderSelect');
  const apiKeyEl = document.getElementById('apiKeyInput');
  const modelEl = document.getElementById('apiModelSelect');
  
  if (providerEl) providerEl.value = provider;
  if (apiKeyEl) apiKeyEl.value = apiKey;
  if (modelEl) modelEl.value = model;
  
  handleProviderChange();
  updateAiStatusBadge();
}
  
function saveAiConfig() {
  const provider = document.getElementById('genProviderSelect').value;
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const model = document.getElementById('apiModelSelect').value;
  
  localStorage.setItem('kaishi_gen_provider', provider);
  localStorage.setItem('kaishi_gen_key', apiKey);
  localStorage.setItem('kaishi_gen_model', model);
}
  
function updateAiStatusBadge() {
  const provider = document.getElementById('genProviderSelect')?.value || 'zero-key';
  const model = document.getElementById('apiModelSelect')?.value || 'gemini-3.8-flash';
  const badge = document.getElementById('aiStatusBadge');
  if (!badge) return;
  if (provider === 'gemini') {
    badge.textContent = `✨ ${model}`;
  } else if (provider === 'openai') {
    badge.textContent = `✨ ${model}`;
  } else {
    badge.textContent = '⚡ Zero-Key (DB)';
  }
}
  
function openAiModal() {
  const modal = document.getElementById('aiSettingsModal');
  if (modal) modal.style.display = 'flex';
}
  
function closeAiModal() {
  const modal = document.getElementById('aiSettingsModal');
  if (modal) modal.style.display = 'none';
  updateAiStatusBadge();
}
  
function handleProviderChange() {
  const provider = document.getElementById('genProviderSelect').value;
  const keyGroup = document.getElementById('apiKeyGroup');
  const modelGroup = document.getElementById('apiModelGroup');
  
  if (provider === 'zero-key') {
    keyGroup.style.display = 'none';
    modelGroup.style.display = 'none';
  } else {
    keyGroup.style.display = 'flex';
    modelGroup.style.display = 'flex';
    const modelEl = document.getElementById('apiModelSelect');
    if (provider === 'gemini') {
      if (!modelEl.value.startsWith('gemini')) modelEl.value = 'gemini-3.8-flash';
    } else if (provider === 'openai') {
      modelEl.value = 'gpt-4o-mini';
    }
  }
  saveAiConfig();
  updateAiStatusBadge();
}
  
function playAudio(rawText) {
  if (!rawText) return;
  const clean = stripHtml(rawText).replace(/\[[^\]]+\]/g, '').trim();
  if (!clean) return;
  
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&ttsspeed=1&q=${encodeURIComponent(clean)}`;
  const audio = new Audio(url);
  audio.playbackRate = 1.15;
  audio.defaultPlaybackRate = 1.15;
  
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = 'ja-JP';
        const voices = window.speechSynthesis.getVoices();
        const jaVoice = voices.find(v => v.lang === 'ja-JP' || v.lang.startsWith('ja') || v.lang.includes('JP'));
        if (jaVoice) utterance.voice = jaVoice;
        utterance.rate = 1.15;
        window.speechSynthesis.speak(utterance);
      }
    });
  }
}
  
function playSimWord() {
  if (parsedResult.length === 0) return;
  const card = parsedResult[currentSimIdx];
  playAudio(card.rawSpeech || card.plain);
}
  
function playSimSentence() {
  if (parsedResult.length === 0) return;
  const card = parsedResult[currentSimIdx];
  playAudio(card.sentence || card.sentenceFurigana || card.plain);
}
  
function processRawText() {
  const raw = document.getElementById('rawInput').value.trim();
  if (!raw) {
    alert('Please paste some vocabulary text or JSON first.');
    return;
  }
  
  parsedResult = parseInputText(raw);
  currentSimIdx = 0;
  simShowBack = false;
  renderPreview();
}
  
let batchDeckList = [];
  
async function parseSingleFile(file) {
  const isApkg = /\.apkg$/i.test(file.name);
  if (isApkg) {
    const res = await parseAnkiApkg(file);
    return {
      fileName: file.name,
      deckName: res.deckName || 'Japanese IT Pathway::Vocab',
      tag: res.tag || 'IT & Business',
      cards: (res.cards || []).map((c, idx) => normalizeCard(c, idx))
    };
  } else {
    const content = await file.text();
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (jsonErr) {
    }
    
    let deckName = '';
    let tag = '';
    let cards = [];
    
    if (parsed && !Array.isArray(parsed) && parsed.cards) {
      deckName = parsed.deckName || '';
      tag = parsed.tag || '';
      cards = parsed.cards;
    } else if (Array.isArray(parsed)) {
      cards = parsed;
    }
    
    const fileName = file.name.replace(/\.json$/i, '');
    if (!deckName) {
      const cleanName = fileName
        .replace(/^Japanese[_\s]+IT[_\s]+Pathway_{1,2}/i, '')
        .replace(/_{2,}/g, '::')
        .replace(/_/g, ' ')
        .trim();
      deckName = cleanName ? `Japanese IT Pathway::${cleanName}` : 'Japanese IT Pathway::Vocab';
      tag = cleanName || 'IT & Business';
    }
    
    if (!tag) {
      const parts = deckName.split('::');
      tag = parts[parts.length - 1].trim();
    }
    
    if (cards.length === 0) {
      cards = parseInputText(content);
    } else {
      cards = cards.map((c, idx) => normalizeCard(c, idx));
    }
    
    return {
      fileName: file.name,
      deckName,
      tag,
      cards
    };
  }
}
  
async function handleFileImport(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  
  if (files.length === 1) {
    const file = files[0];
    try {
      const res = await parseSingleFile(file);
      document.getElementById('deckNameInput').value = res.deckName;
      document.getElementById('deckTagInput').value = res.tag;
      
      document.getElementById('rawInput').value = res.cards.map(c => {
        let str = `${c.plain} [${c.rawSpeech || c.plain}] ${c.english}`;
        if (c.sentence) str += `\n例文: ${c.sentence}`;
        if (c.sentenceEnglish) str += `\n（${c.sentenceEnglish}）`;
        return str;
      }).join('\n\n');
      
      updateInputStats();
      parsedResult = res.cards;
      currentSimIdx = 0;
      simShowBack = false;
      renderPreview();
    } catch (err) {
      alert('Failed to import file: ' + err.message);
    }
  } else {
    const progressContainer = document.getElementById('progressBarContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    progressContainer.style.display = 'flex';
    progressFill.style.width = '0%';
    progressText.textContent = `Importing ${files.length} decks...`;
    
    batchDeckList = [];
    let errCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      progressFill.style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
      progressText.textContent = `Reading (${i + 1}/${files.length}): ${file.name}...`;
      try {
        const deckObj = await parseSingleFile(file);
        if (deckObj && deckObj.cards && deckObj.cards.length > 0) {
          batchDeckList.push(deckObj);
        }
      } catch (err) {
        errCount++;
      }
    }
    
    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 500);
    
    if (batchDeckList.length > 0) {
      renderBatchHub();
      loadDeckFromBatch(0);
    }
    if (errCount > 0) {
      alert(`Imported ${batchDeckList.length} decks (${errCount} files could not be parsed).`);
    }
  }
  event.target.value = '';
}
  
const handleJsonImport = handleFileImport;
  
function renderBatchHub() {
  const batchSection = document.getElementById('batchSection');
  const countEl = document.getElementById('batchDeckCount');
  const totalCardsEl = document.getElementById('batchTotalCards');
  const listEl = document.getElementById('batchDeckList');
  
  if (!batchSection || batchDeckList.length === 0) {
    if (batchSection) batchSection.style.display = 'none';
    return;
  }
  
  let totalCards = 0;
  batchDeckList.forEach(d => { totalCards += (d.cards ? d.cards.length : 0); });
  
  countEl.textContent = `${batchDeckList.length} ${batchDeckList.length === 1 ? 'deck' : 'decks'}`;
  totalCardsEl.textContent = `${totalCards} ${totalCards === 1 ? 'card' : 'cards'}`;
  batchSection.style.display = 'block';
  
  listEl.innerHTML = batchDeckList.map((d, idx) => {
    const cardCount = d.cards ? d.cards.length : 0;
    const sentCount = d.cards ? d.cards.filter(c => c.sentence).length : 0;
    return `
      <div class="batch-deck-item">
        <div class="batch-deck-info">
          <div class="batch-deck-title">${d.deckName}</div>
          <div class="batch-deck-meta">
            <span class="batch-deck-badge">${d.tag}</span>
            <span>${cardCount} cards</span>
            <span>•</span>
            <span style="color: ${sentCount === cardCount ? '#34d399' : '#f59e0b'};">${sentCount}/${cardCount} sentences</span>
          </div>
        </div>
        <div class="batch-deck-actions">
          <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="loadDeckFromBatch(${idx})">👁️ Preview</button>
          <button class="btn-ghost-danger" style="padding: 6px 10px; font-size: 0.8rem;" onclick="removeDeckFromBatch(${idx})">✕</button>
        </div>
      </div>
    `;
  }).join('');
}
  
function loadDeckFromBatch(idx) {
  if (idx < 0 || idx >= batchDeckList.length) return;
  const d = batchDeckList[idx];
  document.getElementById('deckNameInput').value = d.deckName;
  document.getElementById('deckTagInput').value = d.tag;
  
  document.getElementById('rawInput').value = (d.cards || []).map(c => {
    let str = `${c.plain} [${c.rawSpeech || c.plain}] ${c.english}`;
    if (c.sentence) str += `\n例文: ${c.sentence}`;
    if (c.sentenceEnglish) str += `\n（${c.sentenceEnglish}）`;
    return str;
  }).join('\n\n');
  
  updateInputStats();
  parsedResult = d.cards || [];
  currentSimIdx = 0;
  simShowBack = false;
  renderPreview();
}
  
function removeDeckFromBatch(idx) {
  if (idx < 0 || idx >= batchDeckList.length) return;
  batchDeckList.splice(idx, 1);
  if (batchDeckList.length === 0) {
    clearBatch();
  } else {
    renderBatchHub();
  }
}
  
function clearBatch() {
  batchDeckList = [];
  const batchSection = document.getElementById('batchSection');
  if (batchSection) batchSection.style.display = 'none';
}
  
async function exportBatchMasterApkg() {
  if (batchDeckList.length === 0) {
    alert('No decks in batch.');
    return;
  }
  
  const withAudio = document.getElementById('batchAudioToggle')?.checked || false;
  const progressContainer = document.getElementById('progressBarContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const btn = document.getElementById('batchMasterBtn');
  const origText = btn ? btn.textContent : '';
  
  if (btn) {
    btn.textContent = 'Packaging...';
    btn.disabled = true;
  }
  progressContainer.style.display = 'flex';
  progressFill.style.width = '0%';
  progressText.textContent = 'Building Master Anki Package...';
  
  try {
    const apkgBlob = await generateMultiDeckApkg(batchDeckList, {
      withAudio,
      onProgress: (cur, tot, msg) => {
        progressFill.style.width = `${Math.round((cur / tot) * 100)}%`;
        progressText.textContent = msg;
      }
    });
    
    let baseName = 'Japanese_IT_Pathway_Master';
    if (batchDeckList[0] && batchDeckList[0].deckName) {
      const topDeck = batchDeckList[0].deckName.split('::')[0];
      if (topDeck) {
        baseName = topDeck.replace(/[^a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '_') + '_Master';
      }
    }
    
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = URL.createObjectURL(apkgBlob);
    downloadAnchor.download = `${baseName}.apkg`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (err) {
    alert('Failed to generate Master .apkg: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = origText;
      btn.disabled = false;
    }
    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 1500);
  }
}
  
async function exportBatchZip() {
  if (batchDeckList.length === 0) {
    alert('No decks in batch.');
    return;
  }
  
  const withAudio = document.getElementById('batchAudioToggle')?.checked || false;
  const progressContainer = document.getElementById('progressBarContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const btn = document.getElementById('batchZipBtn');
  const origText = btn ? btn.textContent : '';
  
  if (btn) {
    btn.textContent = 'Zipping...';
    btn.disabled = true;
  }
  progressContainer.style.display = 'flex';
  progressFill.style.width = '0%';
  progressText.textContent = 'Generating individual .apkg files...';
  
  try {
    const zipBlob = await generateApkgZipBundle(batchDeckList, {
      withAudio,
      onProgress: (cur, tot, msg) => {
        progressFill.style.width = `${Math.round((cur / tot) * 100)}%`;
        progressText.textContent = msg;
      }
    });
    
    let baseName = 'Japanese_IT_Pathway_Decks';
    if (batchDeckList[0] && batchDeckList[0].deckName) {
      const topDeck = batchDeckList[0].deckName.split('::')[0];
      if (topDeck) {
        baseName = topDeck.replace(/[^a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '_') + '_Decks';
      }
    }
    
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = URL.createObjectURL(zipBlob);
    downloadAnchor.download = `${baseName}.zip`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (err) {
    alert('Failed to generate ZIP bundle: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = origText;
      btn.disabled = false;
    }
    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 1500);
  }
}
  
function switchTab(tabName) {
  const isKaishi = tabName === 'kaishi';
  document.getElementById('tabKaishi').classList.toggle('active', isKaishi);
  document.getElementById('tabList').classList.toggle('active', !isKaishi);
  document.getElementById('tabBtnKaishi').classList.toggle('active', isKaishi);
  document.getElementById('tabBtnList').classList.toggle('active', !isKaishi);
}
  
function toggleSimAnswer() {
  simShowBack = !simShowBack;
  renderSimCard();
}
  
function prevSimCard() {
  if (parsedResult.length === 0) return;
  currentSimIdx = (currentSimIdx - 1 + parsedResult.length) % parsedResult.length;
  simShowBack = false;
  renderSimCard();
}
  
function nextSimCard() {
  if (parsedResult.length === 0) return;
  currentSimIdx = (currentSimIdx + 1) % parsedResult.length;
  simShowBack = false;
  renderSimCard();
}
  
function renderSimCard() {
  const simCard = document.getElementById('simCard');
  const simIndex = document.getElementById('simIndex');
  const simToggleBtn = document.getElementById('simToggleBtn');
  
  if (parsedResult.length === 0) {
    simCard.innerHTML = '<div style="font-size: 20px; font-weight: 700;">No cards loaded</div>';
    simIndex.textContent = 'Card 0 / 0';
    return;
  }
  
  const card = parsedResult[currentSimIdx];
  simIndex.textContent = `Card ${currentSimIdx + 1} / ${parsedResult.length}`;
  
  if (!simShowBack) {
    simToggleBtn.textContent = 'Flip (Show Back)';
    simCard.innerHTML = `
      <div lang="ja">
        <div class="kaishi-word">
          <div class="kaishi-word-wrapper">
            <span>${card.plain}</span>
            <button class="audio-play-btn" title="Pronounce Word" onclick="playSimWord()">&#128266;</button>
          </div>
        </div>
        ${card.sentence ? `
          <div class="kaishi-sentence-front">
            <div class="kaishi-sentence-wrapper">
              <span>${card.sentence}</span>
              <button class="audio-play-btn" title="Pronounce Sentence" onclick="playSimSentence()">&#128266;</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    simToggleBtn.textContent = 'Flip (Show Front)';
    const furiSentence = formatFuriganaToHtml(card.sentenceFurigana || card.sentence);
    
    simCard.innerHTML = `
      <div lang="ja">
        <div class="kaishi-word">
          <div class="kaishi-word-wrapper">
            <span>${card.ruby}</span>
            <button class="audio-play-btn" title="Pronounce Word" onclick="playSimWord()">&#128266;</button>
          </div>
        </div>
        <div class="kaishi-meaning">${card.english}</div>
        ${furiSentence ? `
          <div class="kaishi-sentence">
            <div class="kaishi-sentence-wrapper">
              <span>${furiSentence}</span>
              <button class="audio-play-btn" title="Pronounce Sentence" onclick="playSimSentence()">&#128266;</button>
            </div>
          </div>
        ` : ''}
        ${card.sentenceEnglish ? `<div class="kaishi-sentence-en">${card.sentenceEnglish}</div>` : ''}
      </div>
    `;
  }
}
  
function renderPreview() {
  const previewSection = document.getElementById('previewSection');
  const cardList = document.getElementById('cardList');
  const cardCount = document.getElementById('cardCount');
  
  if (parsedResult.length === 0) {
    previewSection.style.display = 'none';
    return;
  }
  
  cardCount.textContent = `${parsedResult.length} cards`;
  cardList.innerHTML = parsedResult.map((c, idx) => `
    <div class="item-card">
      <div class="item-top">
        <span class="item-term">${c.ruby}</span>
        <span class="item-english">${c.english}</span>
      </div>
      <div class="item-sentence-box">
        <div class="item-sentence-ja">
          ${c.sentence ? `<span>${formatFuriganaToHtml(c.sentenceFurigana || c.sentence)}</span>` : `<span style="color: var(--text-sub); font-style: italic;">No example sentence</span>`}
        </div>
        ${c.sentenceEnglish ? `<div class="item-sentence-en">${c.sentenceEnglish}</div>` : ''}
      </div>
      <div class="item-card-actions">
        <button class="secondary btn-small" onclick="generateSingleCard(${idx})">✨ Generate / Update Sentence</button>
        <button class="secondary btn-small" onclick="playAudio('${(c.sentence || c.plain).replace(/'/g, "\\'")}')">&#128266; Sentence</button>
      </div>
    </div>
  `).join('');
  
  previewSection.style.display = 'flex';
  renderSimCard();
}
  
async function generateSingleCard(index) {
  if (index < 0 || index >= parsedResult.length) return;
  const card = parsedResult[index];
  
  const provider = document.getElementById('genProviderSelect').value;
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const model = document.getElementById('apiModelSelect').value;
  const tag = document.getElementById('deckTagInput').value.trim() || 'IT & Business';
  
  try {
    const res = await generateSentenceForSingleCard(card, provider, apiKey, model, tag);
    if (res.wordFurigana) {
      card.wordFurigana = res.wordFurigana;
      card.ruby = formatFuriganaToHtml(res.wordFurigana);
    }
    card.sentence = res.sentence;
    card.sentenceFurigana = res.sentenceFurigana;
    card.sentenceEnglish = res.sentenceEnglish;
    
    if (card.plain && card.sentence && !card.sentence.includes('<b>')) {
      const escaped = card.plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      card.sentence = card.sentence.replace(new RegExp(`(${escaped})`, 'g'), '<b>$1</b>');
    }
    if (card.plain && card.sentenceFurigana && !card.sentenceFurigana.includes('<b>')) {
      const pattern = typeof escapeWordFuriganaRegex !== 'undefined' ? 
        escapeWordFuriganaRegex(card.wordFurigana || card.plain) : 
        card.plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(pattern).test(card.sentenceFurigana)) {
        card.sentenceFurigana = card.sentenceFurigana.replace(new RegExp(`(\\s*${pattern})`, 'g'), '<b>$1</b>');
      } else {
        const escaped = card.plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        card.sentenceFurigana = card.sentenceFurigana.replace(new RegExp(`(${escaped}\\[[^\\]]+\\]|${escaped})`, 'g'), '<b>$1</b>');
      }
    }
    
    renderPreview();
  } catch (err) {
    alert('Generation error: ' + err.message);
  }
}
  
async function runBatchGeneration(forceAll = false) {
  if (parsedResult.length === 0) {
    processRawText();
  }
  if (parsedResult.length === 0) return;
  
  if (isGenerating) return;
  isGenerating = true;
  
  const progressContainer = document.getElementById('progressBarContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  progressContainer.style.display = 'flex';
  
  const provider = document.getElementById('genProviderSelect').value;
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const model = document.getElementById('apiModelSelect').value;
  const tag = document.getElementById('deckTagInput').value.trim() || 'IT & Business';
  
  try {
    await batchGenerateCardSentences(
      parsedResult, 
      provider, 
      apiKey, 
      model, 
      tag, 
      forceAll, 
      (current, total, msg) => {
        progressFill.style.width = `${Math.round((current / total) * 100)}%`;
        progressText.textContent = msg;
      }
    );
  } catch (err) {
    alert('Error during batch generation: ' + err.message);
    progressText.textContent = 'Error: ' + err.message;
  } finally {
    renderPreview();
    setTimeout(() => {
      progressContainer.style.display = 'none';
      isGenerating = false;
    }, 2000);
  }
}
  
async function exportAnki(withAudio = true) {
  if (parsedResult.length === 0) {
    alert('Please parse some cards first.');
    return;
  }
  
  const exportBtn = withAudio ? document.getElementById('exportApkgBtn') : document.getElementById('exportNoAudioBtn');
  const originalText = exportBtn.textContent;
  exportBtn.textContent = withAudio ? 'Preparing .apkg...' : 'Generating .apkg...';
  exportBtn.disabled = true;
  
  try {
    const deckName = document.getElementById('deckNameInput').value.trim() || 'Japanese IT Pathway::Vocab';
    const tagPrefix = document.getElementById('deckTagInput').value.trim() || 'IT_Pathway';
    
    const apkgBlob = await generateAnkiApkg(parsedResult, {
      deckName,
      tagPrefix,
      withAudio,
      onProgress: (cur, tot, msg) => {
        exportBtn.textContent = msg;
      }
    });
    
    const safeFileName = deckName.replace(/[^a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '_') + (withAudio ? '.apkg' : '_no_audio.apkg');
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = URL.createObjectURL(apkgBlob);
    downloadAnchor.download = safeFileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (err) {
    alert('Failed to generate Anki package: ' + err.message);
    console.error(err);
  } finally {
    exportBtn.textContent = originalText;
    exportBtn.disabled = false;
  }
}
  
function downloadJSON() {
  if (parsedResult.length === 0) return;
  const deckName = document.getElementById('deckNameInput').value.trim() || 'Japanese IT Pathway::Vocab';
  const tag = document.getElementById('deckTagInput').value.trim() || 'IT & Business';
  const safeFileName = deckName.replace(/[^a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '_') + '.json';
  const payload = {
    deckName,
    tag,
    cards: parsedResult
  };
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', safeFileName);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
  
function copyJSON() {
  if (parsedResult.length === 0) return;
  const deckName = document.getElementById('deckNameInput').value.trim() || 'Japanese IT Pathway::Vocab';
  const tag = document.getElementById('deckTagInput').value.trim() || 'IT & Business';
  const payload = {
    deckName,
    tag,
    cards: parsedResult
  };
  navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    .then(() => alert('Deck JSON copied to clipboard!'))
    .catch(() => alert('Failed to copy.'));
}
  
function clearInput() {
  document.getElementById('rawInput').value = '';
  parsedResult = [];
  document.getElementById('previewSection').style.display = 'none';
  updateInputStats();
}
  
function loadSampleText() {
  document.getElementById('rawInput').value = `企業概要 [きぎょうがいよう] Company Overview
例文: 取引先の企業概要を確認して信用調査を行う。
  
要件定義 [ようけんていぎ] Requirements Definition
例: クライアントと打ち合わせをして要件定義書を作成する。
  
クラウド Cloud Computing
例文: 社内システムをクラウド環境に移行する。
  
暗号化 [あんごうか] Encryption
例: 通信データをSSLで暗号化する。`;
  updateInputStats();
  processRawText();
}
  
function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKeyInput');
  const btn = document.getElementById('toggleApiKeyBtn');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = '🔒 Hide';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '👁️ Show';
  }
}
  
function updateInputStats() {
  const raw = document.getElementById('rawInput')?.value || '';
  const statEl = document.getElementById('inputStatsPill');
  if (!statEl) return;
  const lines = raw ? raw.split('\n').filter(l => l.trim().length > 0).length : 0;
  statEl.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'}`;
}
  
async function handleUnifiedGenerate() {
  if (parsedResult.length === 0) {
    processRawText();
  }
  if (parsedResult.length === 0) return;
  
  const needsGen = parsedResult.some(c => !c.sentence || !c.sentenceEnglish);
  if (!needsGen) {
    const confirmRegen = confirm('All cards already have example sentences. Do you want to regenerate all of them?');
    if (!confirmRegen) return;
    await runBatchGeneration(true);
  } else {
    await runBatchGeneration(false);
  }
}
  
async function handleAiFormatNotes() {
  const rawInput = document.getElementById('rawInput');
  const raw = rawInput?.value?.trim();
  if (!raw) {
    alert('Please paste some text into the notes area first.');
    return;
  }
  
  const provider = document.getElementById('genProviderSelect')?.value;
  if (provider === 'zero-key') {
    openAiModal();
    alert('To use AI Format, please select Google Gemini AI and provide your API key in AI Settings.');
    return;
  }
  
  const apiKey = document.getElementById('apiKeyInput')?.value?.trim();
  const model = document.getElementById('apiModelSelect')?.value || 'gemini-3.8-flash';
  const btn = document.getElementById('aiFormatBtn');
  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.textContent = 'Formatting...';
    btn.disabled = true;
  }
  
  try {
    const formatted = await formatNotesWithAi(raw, provider, apiKey, model);
    if (formatted) {
      rawInput.value = formatted;
      updateInputStats();
      processRawText();
    }
  } catch (err) {
    alert('AI Format Error: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }
}
  
window.addEventListener('DOMContentLoaded', () => {
  loadAiConfig();
  updateInputStats();
  const rawEl = document.getElementById('rawInput');
  if (rawEl) {
    rawEl.addEventListener('input', updateInputStats);
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAiModal();
  });
  const modal = document.getElementById('aiSettingsModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAiModal();
    });
  }
});

  