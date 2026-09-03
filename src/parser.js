const kanjiDict = typeof KANJI_READINGS !== 'undefined' ? KANJI_READINGS : (typeof require !== 'undefined' ? require('./kanji_data.js') : {});

const rendakuMap = {
  'か':'が','き':'ぎ','く':'ぐ','け':'げ','こ':'ご',
  'さ':'ざ','し':'じ','す':'ず','せ':'ぜ','そ':'ぞ',
  'た':'だ','ち':'ぢ','つ':'づ','て':'で','と':'ど',
  'は':'ば','ひ':'び','ふ':'ぶ','へ':'べ','ほ':'ぼ'
};
  
const handakutenMap = {
  'は':'ぱ','ひ':'ぴ','ふ':'ぷ','へ':'ぺ','ほ':'ぽ'
};
  
function getKanjiReadings(ch) {
  const base = kanjiDict[ch] || [];
  const set = new Set();
  for (let i = 0; i < base.length; i++) {
    const r = base[i];
    if (!r) continue;
    const clean = r.replace(/[\-\.]/g, '');
    set.add(clean);
    const dotIdx = r.indexOf('.');
    if (dotIdx > 0) {
      set.add(r.slice(0, dotIdx));
    }
    if (r.endsWith('う') || r.endsWith('る') || r.endsWith('く') || r.endsWith('す') || r.endsWith('つ') || r.endsWith('む')) {
      set.add(r.slice(0, -1));
    }
  }
  const expanded = new Set(set);
  for (const r of set) {
    if (!r) continue;
    const first = r[0];
    if (rendakuMap[first]) {
      expanded.add(rendakuMap[first] + r.slice(1));
    }
    if (handakutenMap[first]) {
      expanded.add(handakutenMap[first] + r.slice(1));
    }
    if (r.endsWith('つ') || r.endsWith('ち') || r.endsWith('く') || r.endsWith('き')) {
      expanded.add(r.slice(0, -1) + 'っ');
    }
    if (r === 'にち') {
      expanded.add('に');
    }
  }
  return [...expanded];
}
  
function alignWordFurigana(word, reading) {
  if (!word || !reading) return word || '';
  if (word === reading) return word;
  if (!/[\u4e00-\u9faf]/.test(word)) return word;
  
  let leadPrefix = '';
  let w = word;
  let r = reading;
  
  while (w.length > 0 && /^[\u3040-\u309f]/.test(w) && !r.startsWith(w[0])) {
    leadPrefix += w[0];
    w = w.slice(1);
  }
  
  if (w.startsWith('お') && !r.startsWith('お')) {
    return leadPrefix + 'お' + alignWordFurigana(w.slice(1), r);
  }
  if (w.startsWith('お') && r.startsWith('お')) {
    return leadPrefix + 'お' + alignWordFurigana(w.slice(1), r.slice(1));
  }
  if (w.startsWith('ご') && !r.startsWith('ご')) {
    return leadPrefix + 'ご' + alignWordFurigana(w.slice(1), r);
  }
  if (w.startsWith('ご') && r.startsWith('ご')) {
    return leadPrefix + 'ご' + alignWordFurigana(w.slice(1), r.slice(1));
  }
  
  const singleOkurigana = w.match(/^([\u4e00-\u9faf])([^\u4e00-\u9faf]+)$/);
  if (singleOkurigana && r.endsWith(singleOkurigana[2])) {
    const kReading = r.slice(0, -singleOkurigana[2].length);
    return leadPrefix + ' ' + singleOkurigana[1] + '[' + kReading + ']' + singleOkurigana[2];
  }
  
  function solve(wIdx, rIdx) {
    if (wIdx === w.length && rIdx === r.length) return [];
    if (wIdx === w.length || rIdx === r.length) return null;
    
    const ch = w[wIdx];
    if (!/[\u4e00-\u9faf]/.test(ch)) {
      if (r[rIdx] === ch) {
        const rest = solve(wIdx + 1, rIdx + 1);
        if (rest) return [{ kanji: ch, isKana: true }, ...rest];
      }
      return null;
    }
    
    const readings = getKanjiReadings(ch);
    readings.sort((a, b) => b.length - a.length);
    
    for (let i = 0; i < readings.length; i++) {
      const rd = readings[i];
      if (r.startsWith(rd, rIdx)) {
        const rest = solve(wIdx + 1, rIdx + rd.length);
        if (rest) return [{ kanji: ch, reading: rd }, ...rest];
      }
    }
    return null;
  }
  
  const res = solve(0, 0);
  if (res) {
    let out = leadPrefix;
    for (let i = 0; i < res.length; i++) {
      const part = res[i];
      if (part.isKana) {
        out += part.kanji;
      } else {
        out += ' ' + part.kanji + '[' + part.reading + ']';
      }
    }
    return out.replace(/ {2,}/g, ' ');
  }
  
  return (leadPrefix + ' ' + w + '[' + r + ']').replace(/ {2,}/g, ' ');
}
  
function alignSentenceFurigana(sentence) {
  if (!sentence) return '';
  let s = sentence;
  s = s.replace(/([\u4e00-\u9faf\u3040-\u309f]+)\[([\u3040-\u309f]+)\]/g, function(m, w, r) {
    return alignWordFurigana(w, r);
  });
  s = s.replace(/ {2,}/g, ' ');
  return s;
}
  
function cleanExamplePrefix(line) {
  return line.replace(/^(例文[:：]|例[:：]|ex[:：]|Ex[:：]|[例※・\-])\s*/, '').trim();
}
  
function cleanSentenceRuby(raw, dynamicMap) {
  let s = raw;
  s = s.replace(/([\u4e00-\u9faf]+)[\[\(\{（【《]([\u3040-\u309f]+)[\]\)\}）】》]/g, '$1[$2]');
  
  if (dynamicMap) {
    const keys = Object.keys(dynamicMap).sort((a, b) => b.length - a.length);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const r = dynamicMap[k];
      if (!k || !r || k === r) continue;
      const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<!\\[[^\\]]*)${escapedK}(?!\\[)(?!\\])`, 'g');
      s = s.replace(pattern, `${k}[${r}]`);
    }
  }
  
  return s;
}
  
function stripHtml(html) {
  return (html || '') 
    .replace(/<rt>[\s\S]*?<\/rt>/g, '') 
    .replace(/<rp>[\s\S]*?<\/rp>/g, '') 
    .replace(/<[^>]*>/g, '') 
    .replace(/\s+/g, ' ') 
    .trim();
}
  
function stripFurigana(text) {
  return (text || '') 
    .replace(/<rt>[\s\S]*?<\/rt>/g, '') 
    .replace(/<rp>[\s\S]*?<\/rp>/g, '') 
    .replace(/\[[^\]]*\]/g, '') 
    .replace(/<[^>]*>/g, '') 
    .replace(/\s+/g, '') 
    .trim();
}
  
function rubyToAnkiFurigana(rubyHtml) {
  if (!rubyHtml) return '';
  let res = rubyHtml.replace(/([^\s<>]+)<rt>([^\s<>]+)<\/rt>/g, ' $1[$2]');
  res = res.replace(/<[^>]*>/g, '');
  return res.replace(/\s+/g, ' ').trim();
}
  
function formatFuriganaToHtml(text) {
  if (!text) return '';
  let s = text;
  s = s.replace(/<b>([^<]+)<\/b>/g, function(m, inner) {
    return '<b>' + inner.replace(/ ?([^\s>\[]+)\[([^\]]+)\]/g, function(_, k, r) {
      return '<ruby>' + k + '<rt>' + r + '</rt></ruby>';
    }) + '</b>';
  });
  s = s.replace(/ ?([^\s>\[]+)\[([^\]]+)\]/g, function(_, k, r) {
    return '<ruby>' + k + '<rt>' + r + '</rt></ruby>';
  });
  return s;
}
  
function escapeWordFuriganaRegex(furi) {
  return (furi || '').trim().split(/\s+/).map(function(p) {
    return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('\\s*');
}
  
function normalizeCard(c, idx) {
  const plain = c.plain || c.word || c.kanji || c.expression || '';
  const rawSpeech = c.rawSpeech || c.reading || c.kana || '';
  let wordFurigana = c.wordFurigana || '';
  if (!wordFurigana) {
    if (c.ruby) {
      wordFurigana = rubyToAnkiFurigana(c.ruby);
    } else if (plain && rawSpeech) {
      wordFurigana = alignWordFurigana(plain, rawSpeech);
    } else {
      wordFurigana = plain;
    }
  } else {
    wordFurigana = alignSentenceFurigana(wordFurigana);
  }
  
  const ruby = formatFuriganaToHtml(wordFurigana);
  const english = c.english || c.meaning || c.wordMeaning || c.glossary || '';
  
  let sentence = c.sentence || c.sentenceKanji || '';
  let sentenceFurigana = alignSentenceFurigana(c.sentenceFurigana || '');
  let sentenceEnglish = c.sentenceMeaning || c.sentenceEnglish || '';
  
  if (plain && sentence && !sentence.includes('<b>')) {
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sentence = sentence.replace(new RegExp(`(${escaped})`, 'g'), '<b>$1</b>');
  }
  
  if (plain && sentenceFurigana && !sentenceFurigana.includes('<b>')) {
    const pattern = escapeWordFuriganaRegex(wordFurigana);
    const escapedPlain = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(pattern).test(sentenceFurigana)) {
      sentenceFurigana = sentenceFurigana.replace(new RegExp(`(\\s*${pattern})`, 'g'), '<b>$1</b>');
    } else {
      sentenceFurigana = sentenceFurigana.replace(new RegExp(`(\\s*${escapedPlain}\\[[^\\]]+\\]|${escapedPlain})`, 'g'), '<b>$1</b>');
    }
  }
  
  return {
    id: c.id || (idx + 1),
    plain,
    ruby,
    wordFurigana,
    rawSpeech,
    english,
    sentence,
    sentenceFurigana,
    sentenceEnglish
  };
}
  
function parseCard(headerLine, bodyLines, id, dynamicMap) {
  let header = headerLine.trim();
  let plain = '';
  let reading = '';
  let english = '';
  
  const bracketMatch = header.match(/^(.+?)\s*[\[\(\{（【《]([\u3040-\u309f]+)[\]\)\}）】》]\s*(.*)$/);
  const slashMatch = header.match(/^(.+?)\s*[\/\|]\s*([\u3040-\u309f]+)\s*[\/\|]\s*(.*)$/);
  const joinedMatch = header.match(/^([\u4e00-\u9faf]+)([\u3040-\u309f]+)\s+([a-zA-Z0-9\s\/\(\)\,\.\'\?\!\-&:]+)$/);
  const generalMatch = header.match(/^([^\s]+)\s+(.+)$/);
  
  if (bracketMatch) {
    plain = bracketMatch[1].trim();
    reading = bracketMatch[2].trim();
    english = bracketMatch[3].trim();
  } else if (slashMatch) {
    plain = slashMatch[1].trim();
    reading = slashMatch[2].trim();
    english = slashMatch[3].trim();
  } else if (joinedMatch) {
    plain = joinedMatch[1].trim();
    reading = joinedMatch[2].trim();
    english = joinedMatch[3].trim();
  } else if (generalMatch) {
    plain = generalMatch[1].trim();
    reading = generalMatch[1].trim();
    english = generalMatch[2].trim();
  } else {
    plain = header;
    reading = header;
    english = '';
  }
  
  if (dynamicMap && plain && reading && plain !== reading && !/^[\u3040-\u309f\u30a0-\u30ffA-Za-z0-9]+$/.test(plain)) {
    dynamicMap[plain] = reading;
  }
  
  const wordFurigana = alignWordFurigana(plain, reading);
  const ruby = formatFuriganaToHtml(wordFurigana);
  
  let sentenceKanji = '';
  let sentenceFurigana = '';
  let sentenceEnglish = '';
  
  if (bodyLines.length > 0) {
    let rawExLine = '';
    const exIdx = bodyLines.findIndex(l => /^(例文[:：]|例[:：]|ex[:：]|Ex[:：]|[例※・\-])/.test(l));
    if (exIdx !== -1) {
      rawExLine = cleanSentenceRuby(cleanExamplePrefix(bodyLines[exIdx]), dynamicMap);
    } else {
      rawExLine = cleanSentenceRuby(bodyLines[0], dynamicMap);
    }
    
    if (rawExLine) {
      sentenceKanji = stripFurigana(rawExLine);
      sentenceFurigana = alignSentenceFurigana(rawExLine);
    }
  }
  
  if (plain && sentenceKanji) {
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sentenceKanji = sentenceKanji.replace(new RegExp(`(${escaped})`, 'g'), '<b>$1</b>');
  }
  
  if (plain && sentenceFurigana) {
    const pattern = escapeWordFuriganaRegex(wordFurigana);
    const escapedPlain = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(pattern).test(sentenceFurigana)) {
      sentenceFurigana = sentenceFurigana.replace(new RegExp(`(\\s*${pattern})`, 'g'), '<b>$1</b>');
    } else {
      sentenceFurigana = sentenceFurigana.replace(new RegExp(`(\\s*${escapedPlain}\\[[^\\]]+\\]|${escapedPlain})`, 'g'), '<b>$1</b>');
    }
  }
  
  return {
    id,
    plain,
    ruby,
    wordFurigana,
    rawSpeech: reading,
    english,
    sentence: sentenceKanji,
    sentenceFurigana,
    sentenceEnglish
  };
}
  
function parseInputText(rawText) {
  const raw = rawText.trim();
  if (!raw) return [];
  
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(raw);
      const items = Array.isArray(parsedJson) ? parsedJson : (parsedJson.cards || [parsedJson]);
      return items.map((c, idx) => normalizeCard(c, idx));
    } catch (e) {
    }
  }
  
  const lines = raw.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  const rawCards = [];
  let current = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isExampleNote = /^(例文[:：]|例[:：]|ex[:：]|Ex[:：]|[例※・\-])/.test(line);
    const hasEnglishTail = /[a-zA-Z]{2,}/.test(line);
    const isSentence = /[。！？]/.test(line) || (line.match(/\[[^\]]+\]/g) || []).length >= 2 || (line.length > 35 && !hasEnglishTail);
    const isHeader = !isExampleNote && !isSentence && (
      /[\[\(\{（【《][\u3040-\u309f]+[\]\)\}）】》]/.test(line) ||
      /[\/\|][\u3040-\u309f]+[\/\|]/.test(line) ||
      /^([\u4e00-\u9faf]+)([\u3040-\u309f]+)\s+[a-zA-Z]/.test(line) ||
      (/^([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fafA-Za-z0-9\-_]+)\s+([a-zA-Z])/.test(line) && hasEnglishTail)
    );
    
    if (isHeader) {
      if (current) rawCards.push(current);
      current = { header: line, body: [] };
    } else {
      if (current) {
        current.body.push(line);
      } else {
        current = { header: line, body: [] };
      }
    }
  }
  
  if (current) rawCards.push(current);
  
  const dynamicMap = {};
  return rawCards.map((c, idx) => parseCard(c.header, c.body, idx + 1, dynamicMap));
}
  
if (typeof module !== 'undefined') {
  module.exports = {
    alignWordFurigana,
    alignSentenceFurigana,
    formatFuriganaToHtml,
    rubyToAnkiFurigana,
    normalizeCard,
    parseCard,
    parseInputText,
    stripHtml
  };
}
  