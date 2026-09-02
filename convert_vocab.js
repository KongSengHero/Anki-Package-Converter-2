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

  let formattedDef = '';
  let sentenceKanji = '';
  let sentenceFurigana = '';
  let sentenceEnglish = '';
  let notes = '';

  if (bodyLines.length > 0) {
    const defPart = cleanSentenceRuby(bodyLines[0], dynamicMap);
    if (bodyLines.length > 1) {
      const exLines = bodyLines.slice(1).map(ex => cleanSentenceRuby(cleanExamplePrefix(ex), dynamicMap));
      const examples = exLines.join('<br>');
      formattedDef = `${defPart}<br><small style='color:var(--text-sub);'>例文: ${examples}</small>`;
      sentenceKanji = stripHtml(exLines[0]);
      sentenceFurigana = rubyToAnkiFurigana(exLines[0]);
      sentenceEnglish = stripHtml(defPart);
      notes = formattedDef;
    } else {
      formattedDef = defPart;
      sentenceKanji = stripHtml(defPart);
      sentenceFurigana = rubyToAnkiFurigana(defPart);
      sentenceEnglish = english;
      notes = formattedDef;
    }
  }

  return {
    id,
    plain,
    ruby,
    rawSpeech: reading,
    english,
    def: formattedDef,
    sentence: sentenceKanji,
    sentenceFurigana,
    sentenceEnglish,
    notes
  };
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node convert_vocab.js <inputFile> [outputFile] [--deck <deckName>] [--tag <tagName>]');
  process.exit(1);
}

let inputFilePath = null;
let outputFilePath = null;
let customDeckName = null;
let customTag = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--deck' && i + 1 < args.length) {
    customDeckName = args[++i];
  } else if (arg === '--tag' && i + 1 < args.length) {
    customTag = args[++i];
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
  structuredCards = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));
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

  const jsonOut = outputFilePath && outputFilePath.endsWith('.json') ? 
    outputFilePath : 
    path.resolve(path.dirname(inputFilePath), `${baseName}_formatted.json`);
  fs.writeFileSync(jsonOut, JSON.stringify(structuredCards, null, 2), 'utf8');
  console.log(`Saved JSON: ${jsonOut} (${structuredCards.length} cards)`);
}

const deckName = customDeckName || `Japanese IT Pathway::${baseName}`;
const tagPrefix = customTag || 'IT_Pathway';
const apkgOut = outputFilePath && outputFilePath.endsWith('.apkg') ? 
  outputFilePath : 
  path.resolve(path.dirname(inputFilePath), `${baseName}.apkg`);

const includeAudio = !args.includes('--no-audio');

createAnkiPackage(structuredCards, {
  deckName,
  tagPrefix,
  includeAudio
}).then(buffer => {
  fs.writeFileSync(apkgOut, buffer);
  console.log(`Saved Anki Package (.apkg): ${apkgOut} (${buffer.length} bytes)`);
  console.log(`Deck: "${deckName}" | Cards: ${structuredCards.length} | Audio: ${includeAudio ? 'Yes' : 'No'}`);
}).catch(err => {
  console.error('Error generating Anki package:', err);
  process.exit(1);
});
