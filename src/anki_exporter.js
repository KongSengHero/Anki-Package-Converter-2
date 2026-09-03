const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-./:;<=>?@[]^_`{|}~';

function generateGuid() {
  let guid = '';
  for (let i = 0; i < 10; i++) {
    const idx = Math.floor(Math.random() * GUID_CHARS.length);
    guid += GUID_CHARS[idx];
  }
  return guid;
}
  
function computeStringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
  
function getRandomId() {
  return 1000000000 + Math.floor(Math.random() * 1000000000);
}
 
const KAISHI_CSS = `.card {
 font-family: "ヒラギノ角ゴ Pro W3", "Hiragino Kaku Gothic Pro", "Noto Sans JP", "Noto Sans CJK JP", Osaka, "メイリオ", Meiryo, "ＭＳ Ｐゴシック", "MS PGothic", "MS UI Gothic", sans-serif;
 font-size: 44px;
 text-align: center;
 background-color: #181a20;
 color: #ffffff;
 padding: 36px 16px;
}
 
:not(.nightMode) .card,
.nightMode .card {
 background-color: #181a20;
 color: #ffffff;
}
 
img {
 max-width: 300px;
 max-height: 250px;
}
 
.mobile img {
 max-width: 50vw;
}
 
b {
 color: #5586cd;
 font-weight: bold;
}
 
:not(.nightMode) b,
.nightMode b {
 color: #5586cd;
}
 
ruby {
 display: ruby !important;
}
 
ruby > rt,
rt {
 display: ruby-text !important;
 font-size: 0.5em !important;
 line-height: 1.1;
 text-align: center;
 user-select: none;
 color: #ffffff;
 font-weight: normal;
}`;
	
const KAISHI_Q_FMT = `<div lang="ja">
{{Word}}
{{#Sentence}}
<div style='font-size: 20px;'>{{Sentence}}</div>
{{/Sentence}}
</div>`;
	
const KAISHI_A_FMT = `<style>
ruby { display: ruby !important; }
rt { display: ruby-text !important; font-size: 0.5em !important; }
</style>
<div lang="ja">
{{furigana:Word Furigana}}
	
<!-- This part enables pitch accent.
	
{{#Pitch Accent}}
	<br><div style='font-size: 24px'>{{Pitch Accent}}</div>
{{/Pitch Accent}} 
	
-->
	
<div style='font-size: 25px; padding-bottom: 20px;'>{{Word Meaning}}</div>
<div style='font-size: 25px;'>{{furigana:Sentence Furigana}}</div>
<div style='font-size: 25px; padding-bottom: 10px;'>{{Sentence Meaning}}</div>
	
{{#Word Audio}}{{Word Audio}}{{/Word Audio}}
{{#Sentence Audio}}{{Sentence Audio}}{{/Sentence Audio}}
<br>
{{#Picture}}{{Picture}}{{/Picture}}
	
{{#Notes}}
	<br>
	<div style="font-size: 20px; padding-top: 12px;">Note: {{Notes}}</div>
{{/Notes}}
	
<!-- This part enables pitch accent notes.
	
{{#Pitch Accent Notes}}
<div style="font-size: 20px; width: fit-content; max-width: 40vw; margin: auto">
	<details><summary>Pitch Accent Notes</summary>
		<br>{{Pitch Accent Notes}}
	</details>
</div>
{{/Pitch Accent Notes}}
	
-->
	
</div>`;
	
async function fetchBrowserAudio(text) {
  if (!text) return null;
  const clean = stripHtml(text).replace(/\[[^\]]+\]/g, '').trim();
  if (!clean) return null;
  
  try {
    const initRes = await fetch('https://api.soundoftext.com/sounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'Google',
        data: { text: clean, voice: 'ja-JP' }
      })
    });
    const initData = await initRes.json();
    if (initData && initData.success && initData.id) {
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise(r => setTimeout(r, 600));
        const statusRes = await fetch('https://api.soundoftext.com/sounds/' + initData.id);
        const statusData = await statusRes.json();
        if (statusData && statusData.status === 'Done' && statusData.location) {
          const audioRes = await fetch(statusData.location);
          const arrayBuffer = await audioRes.arrayBuffer();
          return arrayBuffer;
        }
      }
    }
  } catch (err) {
  }
  return null;
}
  
async function generateAnkiApkg(cards, options = {}) {
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
  });
  const db = new SQL.Database();
  
  const deckName = options.deckName || 'Kaishi 1.5k Deck';
  const tagPrefix = options.tagPrefix || '';
  const withAudio = options.withAudio !== false;
  const onProgress = options.onProgress || null;
  
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const deckId = getRandomId();
  const modelId = 1708628080880;
  
  db.run(`CREATE TABLE col (
    id integer primary key,
    crt integer not null,
    mod integer not null,
    scm integer not null,
    ver integer not null,
    dty integer not null,
    usn integer not null,
    ls integer not null,
    conf text not null,
    models text not null,
    decks text not null,
    dconf text not null,
    tags text not null
  );`);
  
  db.run(`CREATE TABLE notes (
    id integer primary key,
    guid text not null,
    mid integer not null,
    mod integer not null,
    usn integer not null,
    tags text not null,
    flds text not null,
    sfld text not null,
    csum integer not null,
    flags integer not null,
    data text not null
  );`);
  
  db.run(`CREATE TABLE cards (
    id integer primary key,
    nid integer not null,
    did integer not null,
    ord integer not null,
    mod integer not null,
    usn integer not null,
    type integer not null,
    queue integer not null,
    due integer not null,
    ivl integer not null,
    factor integer not null,
    reps integer not null,
    lapses integer not null,
    left integer not null,
    odue integer not null,
    odid integer not null,
    flags integer not null,
    data text not null
  );`);
  
  db.run(`CREATE TABLE revlog (
    id integer primary key,
    cid integer not null,
    usn integer not null,
    ease integer not null,
    ivl integer not null,
    lastIvl integer not null,
    factor integer not null,
    time integer not null,
    type integer not null
  );`);
  
  db.run(`CREATE TABLE graves (
    usn integer not null,
    oid integer not null,
    type integer not null
  );`);
  
  db.run(`CREATE INDEX ix_notes_usn on notes (usn);`);
  db.run(`CREATE INDEX ix_cards_usn on cards (usn);`);
  db.run(`CREATE INDEX ix_revlog_usn on revlog (usn);`);
  db.run(`CREATE INDEX ix_cards_nid on cards (nid);`);
  db.run(`CREATE INDEX ix_cards_sched on cards (did, queue, due);`);
  db.run(`CREATE INDEX ix_revlog_cid on revlog (cid);`);
  db.run(`CREATE INDEX ix_notes_csum on notes (csum);`);
  
  const modelObj = {
    css: KAISHI_CSS,
    did: deckId,
    flds: [
      { font: 'Liberation Sans', media: [], name: 'Word', ord: 0, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Word Reading', ord: 1, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Word Meaning', ord: 2, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Word Furigana', ord: 3, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Word Audio', ord: 4, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Sentence', ord: 5, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Sentence Meaning', ord: 6, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Sentence Furigana', ord: 7, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Sentence Audio', ord: 8, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Notes', ord: 9, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Pitch Accent', ord: 10, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Pitch Accent Notes', ord: 11, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Frequency', ord: 12, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Picture', ord: 13, rtl: false, size: 20, sticky: false } 
    ],
    id: String(modelId),
    latexPost: '\\end{document}',
    latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexsvg: false,
    mod: nowSec,
    name: 'Kaishi 1.5k',
    req: [[0, 'all', [0]]],
    sortf: 0,
    tags: [],
    tmpls: [
      {
        afmt: KAISHI_A_FMT,
        bafmt: '',
        bfont: '',
        bqfmt: '',
        bsize: 0,
        did: null,
        name: 'Card 1',
        ord: 0,
        qfmt: KAISHI_Q_FMT
      }
    ],
    type: 0,
    usn: -1,
    vers: []
  };
  
  const modelsJson = {};
  modelsJson[String(modelId)] = modelObj;
  
  const decksJson = {
    '1': {
      collapsed: false,
      conf: 1,
      desc: '',
      dyn: 0,
      extendNew: 10,
      extendRev: 50,
      id: 1,
      lrnToday: [0, 0],
      mod: nowSec,
      name: 'Default',
      newToday: [0, 0],
      revToday: [0, 0],
      timeToday: [0, 0],
      usn: 0
    }
  };
  decksJson[String(deckId)] = {
    collapsed: false,
    conf: 1,
    desc: 'Kaishi 1.5k Core Vocabulary & Example Sentences',
    dyn: 0,
    extendNew: 0,
    extendRev: 50,
    id: deckId,
    lrnToday: [0, 0],
    mod: nowSec,
    name: deckName,
    newToday: [0, 0],
    revToday: [0, 0],
    timeToday: [0, 0],
    usn: -1
  };
  
  const dconfJson = {
    '1': {
      autoplay: true,
      id: 1,
      lapse: {
        delays: [10],
        leechAction: 0,
        leechFails: 8,
        minInt: 1,
        mult: 0
      },
      maxTaken: 60,
      mod: 0,
      name: 'Default',
      new: {
        bury: true,
        delays: [1, 10],
        initialFactor: 2500,
        ints: [1, 4, 7],
        order: 1,
        perDay: 20,
        separate: true
      },
      replayq: true,
      rev: {
        bury: true,
        ease4: 1.3,
        fuzz: 0.05,
        ivlFct: 1,
        maxIvl: 36500,
        minSpace: 1,
        perDay: 100
      },
      timer: 0,
      usn: 0
    }
  };
  
  const confJson = {
    activeDecks: [1],
    addToCur: true,
    collapseTime: 1200,
    curDeck: 1,
    curModel: String(modelId),
    dueCounts: true,
    estTimes: true,
    newBury: true,
    newSpread: 0,
    nextPos: 1,
    sortBackwards: false,
    sortType: 'noteFld',
    timeLim: 0
  };
  
  const colStmt = db.prepare(`INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  colStmt.run([
    null,
    1411124400,
    nowMs,
    nowMs,
    11,
    0,
    0,
    0,
    JSON.stringify(confJson),
    JSON.stringify(modelsJson),
    JSON.stringify(decksJson),
    JSON.stringify(dconfJson),
    '{}'
  ]);
  colStmt.free();
  
  const noteStmt = db.prepare(`INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const cardStmt = db.prepare(`INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  const mediaMap = {};
  const mediaFiles = {};
  let mediaIndex = 0;
  
  for (let i = 0; i < cards.length; i++) {
    if (onProgress) {
      onProgress(i + 1, cards.length, withAudio ? `Generating audio (${i + 1}/${cards.length})...` : `Processing card (${i + 1}/${cards.length})...`);
    }
    const item = cards[i];
    const noteId = nowMs + (i * 2);
    const cardId = nowMs + (i * 2) + 1;
    const guid = generateGuid();
    
    const word = item.plain || item.word || '';
    const wordReading = item.rawSpeech || item.reading || item.kana || '';
    const wordMeaning = item.english || item.meaning || item.wordMeaning || '';
    const wordFurigana = typeof alignWordFurigana !== 'undefined' ? 
      alignWordFurigana(word, wordReading) : 
      (item.wordFurigana || (item.ruby ? rubyToAnkiFurigana(item.ruby) : word));
    let sentence = item.sentence || item.sentenceKanji || '';
    const sentenceMeaning = item.sentenceMeaning || item.sentenceEnglish || '';
    let sentenceFurigana = typeof alignSentenceFurigana !== 'undefined' ? 
      alignSentenceFurigana(item.sentenceFurigana || sentence || '') : 
      (item.sentenceFurigana || sentence || '');
    let wordAudio = item.wordAudio || item.vocabAudio || '';
    let sentenceAudio = item.sentenceAudio || '';
    const notes = item.notes || item.def || '';
    const pitchAccent = item.pitchAccent || '';
    const pitchAccentNotes = item.pitchAccentNotes || '';
    const frequency = item.frequency || String(i + 1);
    const picture = item.picture || item.image || '';
    const tag = tagPrefix || '';
    
    if (withAudio) {
      if (!wordAudio && wordReading) {
        const audioBuf = await fetchBrowserAudio(wordReading);
        if (audioBuf) {
          const fileName = `kaishi_word_${i + 1}.mp3`;
          mediaMap[String(mediaIndex)] = fileName;
          mediaFiles[String(mediaIndex)] = audioBuf;
          mediaIndex++;
          wordAudio = `[sound:${fileName}]`;
        }
      }
      
      if (!sentenceAudio && (sentence || sentenceFurigana)) {
        const audioBuf = await fetchBrowserAudio(sentence || sentenceFurigana);
        if (audioBuf) {
          const fileName = `kaishi_sent_${i + 1}.mp3`;
          mediaMap[String(mediaIndex)] = fileName;
          mediaFiles[String(mediaIndex)] = audioBuf;
          mediaIndex++;
          sentenceAudio = `[sound:${fileName}]`;
        }
      }
    }
    
    if (word && sentence && !sentence.includes('<b>')) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sentence = sentence.replace(new RegExp(`(${escaped})`, 'g'), '<b>$1</b>');
    }
    
    if (word && sentenceFurigana && !sentenceFurigana.includes('<b>')) {
      const pattern = typeof escapeWordFuriganaRegex !== 'undefined' ? 
        escapeWordFuriganaRegex(wordFurigana) : 
        wordFurigana.trim().split(/\s+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
      const escapedPlain = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(pattern).test(sentenceFurigana)) {
        sentenceFurigana = sentenceFurigana.replace(new RegExp(`(\\s*${pattern})`, 'g'), '<b>$1</b>');
      } else {
        sentenceFurigana = sentenceFurigana.replace(new RegExp(`(\\s*${escapedPlain}\\[[^\\]]+\\]|${escapedPlain})`, 'g'), '<b>$1</b>');
      }
    }
    
    const formattedTags = tag ? ` ${tag} ` : '';
    
    const flds = [
      word,
      wordReading,
      wordMeaning,
      wordFurigana,
      wordAudio,
      sentence,
      sentenceMeaning,
      sentenceFurigana,
      sentenceAudio,
      notes,
      pitchAccent,
      pitchAccentNotes,
      frequency,
      picture
    ].join('\x1f');
    
    const sfld = word;
    const csum = computeStringHash(sfld);
    
    noteStmt.run([
      noteId,
      guid,
      modelId,
      nowSec,
      -1,
      formattedTags,
      flds,
      sfld,
      csum,
      0,
      ''
    ]);
    
    cardStmt.run([
      cardId,
      noteId,
      deckId,
      0,
      nowSec,
      -1,
      0,
      0,
      i + 1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ''
    ]);
  }
  
  noteStmt.free();
  cardStmt.free();
  
  const binaryDb = db.export();
  db.close();
  
  const zip = new JSZip();
  zip.file('collection.anki2', binaryDb);
  zip.file('media', JSON.stringify(mediaMap));
  
  for (const idxKey of Object.keys(mediaFiles)) {
    zip.file(idxKey, mediaFiles[idxKey]);
  }
  
  const apkgBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/apkg',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  return apkgBlob;
}
  
async function parseAnkiApkg(fileOrBlob) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip is required to import .apkg files.');
  }
  if (typeof initSqlJs === 'undefined') {
    throw new Error('sql.js is required to read Anki database.');
  }
  
  const zip = await JSZip.loadAsync(fileOrBlob);
  const dbFile = zip.file('collection.anki2') || zip.file('collection.anki21');
  if (!dbFile) {
    throw new Error('Invalid .apkg file: collection.anki2 database not found.');
  }
  
  const binaryDb = await dbFile.async('uint8array');
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
  });
  const db = new SQL.Database(binaryDb);
  
  let deckName = 'Japanese IT Pathway::Vocab';
  let tag = '';
  const models = {};
  
  try {
    const colRes = db.exec('SELECT decks, models FROM col LIMIT 1');
    if (colRes && colRes.length > 0 && colRes[0].values && colRes[0].values[0]) {
      const decksJson = JSON.parse(colRes[0].values[0][0] || '{}');
      const modelsJson = JSON.parse(colRes[0].values[0][1] || '{}');
      const foundDeck = Object.values(decksJson).find(d => d.id != 1) || Object.values(decksJson)[0];
      if (foundDeck && foundDeck.name) {
        deckName = foundDeck.name;
      }
      Object.assign(models, modelsJson);
    }
  } catch (e) {
  }
  
  const cards = [];
  try {
    const notesRes = db.exec('SELECT id, mid, flds, tags FROM notes ORDER BY id ASC');
    if (notesRes && notesRes.length > 0 && notesRes[0].values) {
      const rows = notesRes[0].values;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const mid = row[1];
        const fldsStr = row[2] || '';
        const tagsStr = (row[3] || '').trim();
        if (!tag && tagsStr) {
          tag = tagsStr.split(/\s+/)[0];
        }
        
        const flds = fldsStr.split('\x1f');
        const model = models[mid];
        const fldMap = {};
        if (model && model.flds) {
          for (let f = 0; f < model.flds.length; f++) {
            const fDef = model.flds[f];
            if (fDef && fDef.name) {
              fldMap[fDef.name.toLowerCase().trim()] = flds[f] || '';
            }
          }
        }
        
        let plain = fldMap['word'] || fldMap['front'] || fldMap['expression'] || fldMap['kanji'] || fldMap['japanese'] || flds[0] || '';
        let wordFurigana = fldMap['word furigana'] || fldMap['furigana'] || fldMap['reading'] || flds[1] || '';
        let rawSpeech = fldMap['raw speech'] || fldMap['reading'] || flds[2] || '';
        let english = fldMap['word meaning'] || fldMap['meaning'] || fldMap['english'] || fldMap['definition'] || fldMap['back'] || flds[5] || flds[1] || '';
        let sentence = fldMap['sentence'] || flds[6] || '';
        let sentenceFurigana = fldMap['sentence furigana'] || flds[7] || '';
        let sentenceEnglish = fldMap['sentence meaning'] || fldMap['sentence english'] || flds[8] || '';
        
        plain = typeof stripHtml === 'function' ? stripHtml(plain) : plain.replace(/<[^>]*>/g, '').trim();
        wordFurigana = typeof stripHtml === 'function' ? stripHtml(wordFurigana) : wordFurigana.replace(/<[^>]*>/g, '').trim();
        rawSpeech = (typeof stripHtml === 'function' ? stripHtml(rawSpeech || wordFurigana) : (rawSpeech || wordFurigana).replace(/<[^>]*>/g, '')).replace(/\[[^\]]+\]/g, '').trim();
        english = typeof stripHtml === 'function' ? stripHtml(english) : english.replace(/<[^>]*>/g, '').trim();
        sentence = typeof stripHtml === 'function' ? stripHtml(sentence) : sentence.replace(/<[^>]*>/g, '').trim();
        sentenceFurigana = typeof stripHtml === 'function' ? stripHtml(sentenceFurigana) : sentenceFurigana.replace(/<[^>]*>/g, '').trim();
        sentenceEnglish = typeof stripHtml === 'function' ? stripHtml(sentenceEnglish) : sentenceEnglish.replace(/<[^>]*>/g, '').trim();
        
        if (!rawSpeech && wordFurigana) {
          rawSpeech = wordFurigana.replace(/\[[^\]]+\]/g, '').trim();
        }
        
        cards.push({
          id: i + 1,
          plain,
          ruby: typeof formatFuriganaToHtml === 'function' ? formatFuriganaToHtml(wordFurigana || plain) : (wordFurigana || plain),
          wordFurigana: wordFurigana || plain,
          rawSpeech: rawSpeech || plain,
          english,
          sentence,
          sentenceFurigana: sentenceFurigana || sentence,
          sentenceEnglish
        });
      }
    }
  } finally {
    db.close();
  }
  
  if (!tag && deckName) {
    const parts = deckName.split('::');
    tag = parts[parts.length - 1].trim();
  }
  
  return {
    deckName,
    tag,
    cards
  };
}
  
async function generateMultiDeckApkg(deckList, options = {}) {
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
  });
  const db = new SQL.Database();
  
  const withAudio = options.withAudio === true;
  const onProgress = options.onProgress || null;
  
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const modelId = 1708628080880;
  
  db.run(`CREATE TABLE col (
    id integer primary key,
    crt integer not null,
    mod integer not null,
    scm integer not null,
    ver integer not null,
    dty integer not null,
    usn integer not null,
    ls integer not null,
    conf text not null,
    models text not null,
    decks text not null,
    dconf text not null,
    tags text not null
  );`);
  
  db.run(`CREATE TABLE notes (
    id integer primary key,
    guid text not null,
    mid integer not null,
    mod integer not null,
    usn integer not null,
    tags text not null,
    flds text not null,
    sfld text not null,
    csum integer not null,
    flags integer not null,
    data text not null
  );`);
  
  db.run(`CREATE TABLE cards (
    id integer primary key,
    nid integer not null,
    did integer not null,
    ord integer not null,
    mod integer not null,
    usn integer not null,
    type integer not null,
    queue integer not null,
    due integer not null,
    ivl integer not null,
    factor integer not null,
    reps integer not null,
    lapses integer not null,
    left integer not null,
    odue integer not null,
    odid integer not null,
    flags integer not null,
    data text not null
  );`);
  
  db.run(`CREATE TABLE revlog (
    id integer primary key,
    cid integer not null,
    usn integer not null,
    ease integer not null,
    ivl integer not null,
    lastIvl integer not null,
    factor integer not null,
    time integer not null,
    type integer not null
  );`);
  
  db.run(`CREATE TABLE graves (
    usn integer not null,
    oid integer not null,
    type integer not null
  );`);
  
  db.run(`CREATE INDEX ix_notes_usn on notes (usn);`);
  db.run(`CREATE INDEX ix_cards_usn on cards (usn);`);
  db.run(`CREATE INDEX ix_revlog_usn on revlog (usn);`);
  db.run(`CREATE INDEX ix_cards_nid on cards (nid);`);
  db.run(`CREATE INDEX ix_cards_sched on cards (did, queue, due);`);
  db.run(`CREATE INDEX ix_revlog_cid on revlog (cid);`);
  db.run(`CREATE INDEX ix_notes_csum on notes (csum);`);
  
  const modelObj = {
    css: KAISHI_CSS,
    did: 1,
    flds: [
      { font: 'Liberation Sans', media: [], name: 'Word', ord: 0, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Word Reading', ord: 1, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Word Meaning', ord: 2, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Word Furigana', ord: 3, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Word Audio', ord: 4, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Sentence', ord: 5, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Sentence Meaning', ord: 6, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Sentence Furigana', ord: 7, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Sentence Audio', ord: 8, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Notes', ord: 9, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Pitch Accent', ord: 10, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Pitch Accent Notes', ord: 11, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Frequency', ord: 12, rtl: false, size: 20, sticky: false }, 
      { font: 'Liberation Sans', media: [], name: 'Picture', ord: 13, rtl: false, size: 20, sticky: false } 
    ],
    id: String(modelId),
    latexPost: '\\end{document}',
    latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexsvg: false,
    mod: nowSec,
    name: 'Kaishi 1.5k',
    req: [[0, 'all', [0]]],
    sortf: 0,
    tags: [],
    tmpls: [
      {
        afmt: KAISHI_A_FMT,
        bafmt: '',
        bfont: '',
        bqfmt: '',
        bsize: 0,
        did: null,
        name: 'Card 1',
        ord: 0,
        qfmt: KAISHI_Q_FMT
      }
    ],
    type: 0,
    usn: -1,
    vers: []
  };
  
  const modelsJson = {};
  modelsJson[String(modelId)] = modelObj;
  
  const decksJson = {
    '1': {
      collapsed: false,
      conf: 1,
      desc: '',
      dyn: 0,
      extendNew: 10,
      extendRev: 50,
      id: 1,
      lrnToday: [0, 0],
      mod: nowSec,
      name: 'Default',
      newToday: [0, 0],
      revToday: [0, 0],
      timeToday: [0, 0],
      usn: 0
    }
  };
  
  for (let d = 0; d < deckList.length; d++) {
    const dItem = deckList[d];
    const dId = dItem.deckId || (1708600000000 + d * 100);
    dItem.deckId = dId;
    decksJson[String(dId)] = {
      collapsed: false,
      conf: 1,
      desc: 'Kaishi 1.5k Core Vocabulary & Example Sentences',
      dyn: 0,
      extendNew: 0,
      extendRev: 50,
      id: dId,
      lrnToday: [0, 0],
      mod: nowSec,
      name: dItem.deckName || `Deck ${d + 1}`,
      newToday: [0, 0],
      revToday: [0, 0],
      timeToday: [0, 0],
      usn: -1
    };
  }
  
  const dconfJson = {
    '1': {
      autoplay: true,
      id: 1,
      lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
      maxTaken: 60,
      mod: 0,
      name: 'Default',
      new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 },
      replayq: true,
      rev: { bury: true, ease4: 1.3, fuz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 200 },
      timer: 0,
      usn: 0
    }
  };
  
  const colStmt = db.prepare(`INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  colStmt.run([
    1,
    nowSec,
    nowMs,
    nowMs,
    11,
    0,
    0,
    0,
    JSON.stringify({
      activeDecks: [1],
      curDeck: 1,
      newSpread: 0,
      collapseTime: 1200,
      timeLim: 0,
      estTimes: true,
      dueCounts: true,
      curModel: String(modelId),
      nextPos: 1
    }),
    JSON.stringify(modelsJson),
    JSON.stringify(decksJson),
    JSON.stringify(dconfJson),
    '{}'
  ]);
  colStmt.free();
  
  const noteStmt = db.prepare(`INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const cardStmt = db.prepare(`INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  const mediaMap = {};
  const mediaFiles = {};
  let mediaCounter = 0;
  
  let totalCards = 0;
  deckList.forEach(d => { totalCards += (d.cards ? d.cards.length : 0); });
  let processedCards = 0;
  
  for (let d = 0; d < deckList.length; d++) {
    const dItem = deckList[d];
    const cards = dItem.cards || [];
    const tag = dItem.tag || '';
    const formattedTags = tag ? ` ${tag.replace(/\s+/g, '_')} ` : '';
    
    for (let i = 0; i < cards.length; i++) {
      processedCards++;
      const card = cards[i];
      const noteId = nowMs + processedCards * 2;
      const cardId = nowMs + processedCards * 2 + 1;
      const guid = generateGuid();
      
      const word = card.plain || '';
      const wordReading = card.rawSpeech || card.plain || '';
      const wordMeaning = card.english || '';
      const wordFurigana = card.wordFurigana || card.plain || '';
      const sentence = card.sentence || '';
      const sentenceMeaning = card.sentenceEnglish || '';
      const sentenceFurigana = card.sentenceFurigana || card.sentence || '';
      
      let wordAudioTag = '';
      let sentenceAudioTag = '';
      
      if (withAudio && wordReading) {
        if (onProgress) {
          onProgress(processedCards, totalCards, `Generating audio for "${word}" (${processedCards}/${totalCards})...`);
        }
        const wAudio = await fetchBrowserAudio(wordReading);
        if (wAudio) {
          const wFilename = `kaishi_w_${computeStringHash(wordReading)}.mp3`;
          mediaMap[String(mediaCounter)] = wFilename;
          mediaFiles[String(mediaCounter)] = wAudio;
          mediaCounter++;
          wordAudioTag = `[sound:${wFilename}]`;
        }
      }
      
      if (withAudio && sentence) {
        const sAudio = await fetchBrowserAudio(sentence);
        if (sAudio) {
          const sFilename = `kaishi_s_${computeStringHash(sentence)}.mp3`;
          mediaMap[String(mediaCounter)] = sFilename;
          mediaFiles[String(mediaCounter)] = sAudio;
          mediaCounter++;
          sentenceAudioTag = `[sound:${sFilename}]`;
        }
      }
      
      const fieldValues = [
        word,
        wordReading,
        wordMeaning,
        wordFurigana,
        wordAudioTag,
        sentence,
        sentenceMeaning,
        sentenceFurigana,
        sentenceAudioTag,
        '',
        '',
        '',
        '',
        ''
      ];
      
      const flds = fieldValues.join('\x1f');
      const sfld = word;
      const csum = computeStringHash(sfld);
      
      noteStmt.run([
        noteId,
        guid,
        modelId,
        nowSec,
        -1,
        formattedTags,
        flds,
        sfld,
        csum,
        0,
        ''
      ]);
      
      cardStmt.run([
        cardId,
        noteId,
        dItem.deckId,
        0,
        nowSec,
        -1,
        0,
        0,
        processedCards,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        ''
      ]);
    }
  }
  
  noteStmt.free();
  cardStmt.free();
  
  if (onProgress) {
    onProgress(totalCards, totalCards, 'Finalizing Master Anki package...');
  }
  
  const binaryDb = db.export();
  db.close();
  
  const zip = new JSZip();
  zip.file('collection.anki2', binaryDb);
  zip.file('media', JSON.stringify(mediaMap));
  
  for (const idxKey of Object.keys(mediaFiles)) {
    zip.file(idxKey, mediaFiles[idxKey]);
  }
  
  const apkgBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/apkg',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  return apkgBlob;
}
  
async function generateApkgZipBundle(deckList, options = {}) {
  const masterZip = new JSZip();
  const withAudio = options.withAudio === true;
  const onProgress = options.onProgress || null;
  
  for (let i = 0; i < deckList.length; i++) {
    const d = deckList[i];
    if (onProgress) {
      onProgress(i + 1, deckList.length, `Packaging deck ${i + 1}/${deckList.length}: ${d.deckName}...`);
    }
    
    const apkgBlob = await generateAnkiApkg(d.cards, {
      deckName: d.deckName,
      tagPrefix: d.tag,
      withAudio
    });
    
    const safeName = (d.deckName || `Deck_${i + 1}`).replace(/[^a-zA-Z0-9_\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '_') + '.apkg';
    masterZip.file(safeName, apkgBlob);
  }
  
  if (onProgress) {
    onProgress(deckList.length, deckList.length, 'Compressing ZIP bundle...');
  }
  
  const zipBlob = await masterZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  
  return zipBlob;
}
  
if (typeof module !== 'undefined') {
  module.exports = {
    generateAnkiApkg,
    generateMultiDeckApkg,
    generateApkgZipBundle,
    parseAnkiApkg,
    KAISHI_CSS,
    KAISHI_Q_FMT,
    KAISHI_A_FMT
  };
}
  