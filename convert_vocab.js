const fs = require('fs');
const path = require('path');
const { createAnkiPackage } = require('./anki_exporter');

function cleanExamplePrefix(line) {
  return line.replace(/^([例※・\-]|例文[:：]|ex[:：]|Ex[:：])\s*/, '').trim();
}

function cleanSentenceRuby(raw, dynamicMap) {
  let s = raw;
  s = s.replace(/([\u4e00-\u9faf]+)[\[\(\{（【《]([\u3040-\u309f]+)[\]\)\}）】》]/g, '<ruby>$1<rt>$2</rt></ruby>');
  
  if (dynamicMap) {
    const keys = Object.keys(dynamicMap).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      const r = dynamicMap[k];
      if (!k || !r || k === r) continue;
      const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<!<ruby>[^>]*)(?<!<rt>[^>]*)${escapedK}(?!<\/rt>)(?!<\/ruby>)`, 'g');
      s = s.replace(pattern, `<ruby>${k}<rt>${r}</rt></ruby>`);
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

function rubyToAnkiFurigana(rubyHtml) {
  if (!rubyHtml) return '';
  let res = rubyHtml.replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/g, ' $1[$2]');
  res = res.replace(/<[^>]*>/g, '');
  return res.replace(/\s+/g, ' ').trim();
}

async function autoTranslateJaToEn(text) {
  if (!text) return '';
  const clean = stripHtml(text).replace(/\[[^\]]+\]/g, '').trim();
  if (!clean) return '';
  
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      return data[0].map(item => item[0]).join('').trim();
    }
  } catch (err) {
  }
  return '';
}

async function fetchTatoebaSentence(word) {
  if (!word) return null;
  try {
    const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(word)}&orphans=no&unapproved=no`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await res.json();
    if (data && data.results && data.results.length > 0) {
      for (const item of data.results) {
        if (item.text && item.text.includes(word)) {
          let enText = '';
          if (item.translations && item.translations.length > 0) {
            const enObj = item.translations.flat().find(t => t.lang === 'eng');
            if (enObj) enText = enObj.text;
          }
          if (!enText) {
            enText = await autoTranslateJaToEn(item.text);
          }
          return {
            sentence: item.text,
            sentenceEnglish: enText
          };
        }
      }
    }
  } catch (err) {
  }
  return null;
}

async function callGeminiBatch(apiKey, model, chunkCards, tag) {
  const cleanModel = (model || 'gemini-3.5-flash').replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
  const prompt = `Generate authentic Japanese example sentences tailored to ${tag} context for each of the following words.
Vocabulary list:
${JSON.stringify(chunkCards, null, 2)}

Return ONLY a JSON array with an item for each vocabulary word in this exact format:
[
  {
    "idx": 0,
    "sentence": "Japanese sentence with target word in <b></b>",
    "sentenceFurigana": "Japanese sentence with all kanji furigana in brackets like 漢字[かんじ] and target word bolded like <b>要件定義[ようけんていぎ]</b>",
    "sentenceMeaning": "Accurate English translation of the sentence"
  }
]`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  return JSON.parse(text);
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

  let ruby = `<ruby>${plain}<rt>${reading}</rt></ruby>`;
  if (plain === reading || /^[A-Za-z0-9\u30a0-\u30ff\s]+$/.test(plain)) {
    ruby = plain;
  }

  let sentenceKanji = '';
  let sentenceFurigana = '';
  let sentenceEnglish = '';

  if (bodyLines.length > 0) {
    let rawExLine = '';
    const exIdx = bodyLines.findIndex(l => /^([例※・\-]|例文[:：]|ex[:：]|Ex[:：])/.test(l));
    if (exIdx !== -1) {
      rawExLine = cleanSentenceRuby(cleanExamplePrefix(bodyLines[exIdx]), dynamicMap);
    } else {
      rawExLine = cleanSentenceRuby(bodyLines[0], dynamicMap);
    }
    
    if (rawExLine) {
      sentenceKanji = stripHtml(rawExLine);
      sentenceFurigana = rubyToAnkiFurigana(rawExLine);
    }
  }

  if (plain && sentenceKanji) {
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sentenceKanji = sentenceKanji.replace(new RegExp(`(${escaped})`, 'g'), '<b>$1</b>');
  }

  if (plain && sentenceFurigana) {
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sentenceFurigana = sentenceFurigana.replace(new RegExp(`(${escaped}\\[[^\\]]+\\]|${escaped})`, 'g'), '<b>$1</b>');
  }

  return {
    id,
    plain,
    ruby,
    rawSpeech: reading,
    english,
    sentence: sentenceKanji,
    sentenceFurigana,
    sentenceEnglish
  };
}

function normalizeCard(c, idx) {
  const plain = c.plain || c.word || c.kanji || c.expression || '';
  const rawSpeech = c.rawSpeech || c.reading || c.kana || '';
  let ruby = c.ruby || c.wordFurigana || '';
  if (!ruby) {
    if (plain && rawSpeech && plain !== rawSpeech) {
      ruby = `<ruby>${plain}<rt>${rawSpeech}</rt></ruby>`;
    } else {
      ruby = plain;
    }
  }
  const english = c.english || c.meaning || c.wordMeaning || c.glossary || '';
  
  let sentence = c.sentence || c.sentenceKanji || '';
  let sentenceFurigana = c.sentenceFurigana || '';
  let sentenceEnglish = c.sentenceMeaning || c.sentenceEnglish || '';

  if (plain && sentence && !sentence.includes('<b>')) {
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sentence = sentence.replace(new RegExp(`(${escaped})`, 'g'), '<b>$1</b>');
  }

  if (plain && sentenceFurigana && !sentenceFurigana.includes('<b>')) {
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sentenceFurigana = sentenceFurigana.replace(new RegExp(`(${escaped}\\[[^\\]]+\\]|${escaped})`, 'g'), '<b>$1</b>');
  }

  return {
    id: c.id || (idx + 1),
    plain,
    ruby,
    rawSpeech,
    english,
    sentence,
    sentenceFurigana,
    sentenceEnglish
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node convert_vocab.js <inputFile> [outputFile] [--deck <deckName>] [--tag <tagName>] [--auto-sentences] [--ai] [--gemini-key <key>]');
    process.exit(1);
  }

  let inputFilePath = null;
  let outputFilePath = null;
  let customDeckName = null;
  let customTag = null;
  let autoSentences = false;
  let useAi = false;
  let geminiKey = process.env.GEMINI_API_KEY || null;
  let geminiModel = 'gemini-3.5-flash';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--deck' && i + 1 < args.length) {
      customDeckName = args[++i];
    } else if (arg === '--tag' && i + 1 < args.length) {
      customTag = args[++i];
    } else if (arg === '--auto-sentences') {
      autoSentences = true;
    } else if (arg === '--ai') {
      useAi = true;
      autoSentences = true;
    } else if (arg === '--gemini-key' && i + 1 < args.length) {
      geminiKey = args[++i];
      useAi = true;
      autoSentences = true;
    } else if (arg === '--model' && i + 1 < args.length) {
      geminiModel = args[++i];
    } else if (!inputFilePath) {
      inputFilePath = path.resolve(arg);
    } else if (!outputFilePath) {
      outputFilePath = path.resolve(arg);
    }
  }

  if (!inputFilePath || !fs.existsSync(inputFilePath)) {
    console.error('Input file not found:', inputFilePath);
    process.exit(1);
  }

  const baseName = path.basename(inputFilePath, path.extname(inputFilePath));
  const isJsonInput = inputFilePath.toLowerCase().endsWith('.json');

  let structuredCards = [];

  if (isJsonInput) {
    const rawParsed = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));
    const items = Array.isArray(rawParsed) ? rawParsed : (rawParsed.cards || [rawParsed]);
    structuredCards = items.map((c, idx) => normalizeCard(c, idx));
  } else {
    const text = fs.readFileSync(inputFilePath, 'utf8').replace(/\r\n/g, '\n');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const rawCards = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isExampleNote = /^([例※・\-]|例文[:：]|ex[:：]|Ex[:：])/.test(line);
      const hasEnglishTail = /[a-zA-Z]{2,}/.test(line);
      const isHeader = !isExampleNote && (
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
        }
      }
    }
    if (current) rawCards.push(current);

    const dynamicMap = {};
    structuredCards = rawCards.map((c, index) => parseCard(c.header, c.body, index + 1, dynamicMap));
  }

  const tagPrefix = customTag || 'IT_Pathway';

  if (autoSentences) {
    console.log(`Auto-generating example sentences and translations (Mode: ${useAi ? 'Gemini AI' : 'Zero-Key'})...`);
    
    if (useAi && geminiKey) {
      const missing = [];
      for (let i = 0; i < structuredCards.length; i++) {
        const c = structuredCards[i];
        if (!c.sentence || !c.sentenceEnglish) {
          missing.push({
            idx: i,
            plain: c.plain,
            reading: c.rawSpeech,
            english: c.english
          });
        }
      }

      if (missing.length > 0) {
        const batchSize = 10;
        for (let b = 0; b < missing.length; b += batchSize) {
          const chunk = missing.slice(b, b + batchSize);
          console.log(`Processing AI batch ${Math.floor(b / batchSize) + 1}/${Math.ceil(missing.length / batchSize)}...`);
          const results = await callGeminiBatch(geminiKey, geminiModel, chunk, tagPrefix);
          const items = Array.isArray(results) ? results : (results.cards || results.items || [results]);
          for (const item of items) {
            const cardIdx = item.idx !== undefined ? item.idx : chunk[0].idx;
            if (cardIdx !== undefined && structuredCards[cardIdx]) {
              const card = structuredCards[cardIdx];
              card.sentence = item.sentence || card.sentence;
              card.sentenceFurigana = item.sentenceFurigana || card.sentenceFurigana;
              card.sentenceEnglish = item.sentenceMeaning || item.sentenceEnglish || card.sentenceEnglish;
            }
          }
        }
      }
    } else {
      for (let i = 0; i < structuredCards.length; i++) {
        const card = structuredCards[i];
        if (card.sentence && !card.sentenceEnglish) {
          card.sentenceEnglish = await autoTranslateJaToEn(card.sentence);
        } else if (!card.sentence) {
          const tRes = await fetchTatoebaSentence(card.plain);
          if (tRes) {
            card.sentence = tRes.sentence;
            card.sentenceFurigana = tRes.sentence;
            card.sentenceEnglish = tRes.sentenceEnglish;
          } else {
            card.sentence = `${card.plain}を活用して業務を推進する。`;
            card.sentenceFurigana = card.sentence;
            card.sentenceEnglish = await autoTranslateJaToEn(card.sentence);
          }
        }
        
        if (card.plain && card.sentence && !card.sentence.includes('<b>')) {
          const escaped = card.plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          card.sentence = card.sentence.replace(new RegExp(`(${escaped})`, 'g'), '<b>$1</b>');
        }
        if (card.plain && card.sentenceFurigana && !card.sentenceFurigana.includes('<b>')) {
          const escaped = card.plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          card.sentenceFurigana = card.sentenceFurigana.replace(new RegExp(`(${escaped}\\[[^\\]]+\\]|${escaped})`, 'g'), '<b>$1</b>');
        }
      }
    }
  }

  const jsonOut = outputFilePath && outputFilePath.endsWith('.json') ? 
    outputFilePath : 
    path.resolve(path.dirname(inputFilePath), `${baseName}_formatted.json`);
  fs.writeFileSync(jsonOut, JSON.stringify(structuredCards, null, 2), 'utf8');
  console.log(`Saved JSON: ${jsonOut} (${structuredCards.length} cards)`);

  const deckName = customDeckName || `Japanese IT Pathway::${baseName}`;
  const apkgOut = outputFilePath && outputFilePath.endsWith('.apkg') ? 
    outputFilePath : 
    path.resolve(path.dirname(inputFilePath), `${baseName}.apkg`);

  const includeAudio = !args.includes('--no-audio');

  const buffer = await createAnkiPackage(structuredCards, {
    deckName,
    tagPrefix,
    includeAudio
  });

  fs.writeFileSync(apkgOut, buffer);
  console.log(`Saved Anki Package (.apkg): ${apkgOut} (${buffer.length} bytes)`);
  console.log(`Deck: "${deckName}" | Cards: ${structuredCards.length} | Audio: ${includeAudio ? 'Yes' : 'No'}`);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
