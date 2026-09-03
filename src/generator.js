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
      headers: { 'Accept': 'application/json' }
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
  
async function callGeminiApi(apiKey, model, promptText) {
  const cleanModel = (model || 'gemini-3.8-flash').replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        parts: [
          {
            text: promptText
          }
        ]
      }
    ],
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
    throw new Error(`Gemini Error (${res.status}): ${errText}`);
  }
  
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return JSON.parse(text);
}
  
async function callOpenAiApi(apiKey, model, promptText) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: model || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a Japanese language instructor for IT and Business Japanese. Return JSON only.'
      },
      {
        role: 'user',
        content: promptText
      }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  };
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Error (${res.status}): ${errText}`);
  }
  
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}
  
async function generateSentenceForSingleCard(card, provider, apiKey, model, tag) {
  if (provider === 'gemini' || provider === 'openai') {
    if (!apiKey) throw new Error('Please enter your API Key in settings.');
    
    const prompt = `For the following Japanese vocabulary word, generate a natural Japanese example sentence relevant to ${tag} context, along with Anki Kaishi furigana notation and natural English translation.
Word: "${card.plain}"
Reading: "${card.rawSpeech}"
Meaning: "${card.english}"
  
Return ONLY a JSON object with this exact structure:
{
  "wordFurigana": "Word with every single kanji annotated individually with Anki furigana brackets like 自[じ] 治[ち] 体[たい]",
  "sentence": "Japanese sentence with target word surrounded by <b></b>",
  "sentenceFurigana": "Japanese sentence with every individual kanji annotated individually with Anki furigana brackets and spaces like 粗[そ] 大[だい]ゴミ and target word bolded like <b> 自[じ] 治[ち] 体[たい]</b>",
  "sentenceMeaning": "Accurate natural English translation of the sentence"
}`;
  
    const res = provider === 'gemini' ? 
      await callGeminiApi(apiKey, model, prompt) : 
      await callOpenAiApi(apiKey, model, prompt);
    
    const wFuri = res.wordFurigana ? 
      alignSentenceFurigana(res.wordFurigana) : 
      alignWordFurigana(card.plain, card.rawSpeech);
    const sFuri = alignSentenceFurigana(res.sentenceFurigana || res.sentence || '');
    
    return {
      wordFurigana: wFuri,
      sentence: res.sentence || '',
      sentenceFurigana: sFuri,
      sentenceEnglish: res.sentenceMeaning || res.sentenceEnglish || ''
    };
  } else {
    const tatoebaResult = await fetchTatoebaSentence(card.plain);
    if (tatoebaResult) {
      let sentence = tatoebaResult.sentence;
      let sentenceFurigana = alignSentenceFurigana(sentence);
      const wFuri = alignWordFurigana(card.plain, card.rawSpeech);
      return {
        wordFurigana: wFuri,
        sentence,
        sentenceFurigana,
        sentenceEnglish: tatoebaResult.sentenceEnglish
      };
    }
    
    const fallbackSent = `${card.plain}を活用して業務を推進する。`;
    const wFuri = alignWordFurigana(card.plain, card.rawSpeech);
    let fallbackFuri = alignSentenceFurigana(fallbackSent);
    const enTrans = await autoTranslateJaToEn(fallbackSent);
    return {
      wordFurigana: wFuri,
      sentence: fallbackSent,
      sentenceFurigana: fallbackFuri,
      sentenceEnglish: enTrans || card.english
    };
  }
}
  
async function batchGenerateCardSentences(cards, provider, apiKey, model, tag, forceAll, onProgress) {
  const toProcess = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (forceAll || !c.sentence || !c.sentenceEnglish) {
      toProcess.push(i);
    }
  }
  
  if (toProcess.length === 0) {
    if (onProgress) onProgress(1, 1, 'All cards already have sentences and translations!');
    return;
  }
  
  if ((provider === 'gemini' || provider === 'openai') && toProcess.length > 1) {
    if (!apiKey) throw new Error('Please enter your API Key in settings.');
    
    const batchSize = 10;
    for (let b = 0; b < toProcess.length; b += batchSize) {
      const chunkIndices = toProcess.slice(b, b + batchSize);
      const chunkCards = chunkIndices.map(idx => ({
        idx,
        plain: cards[idx].plain,
        reading: cards[idx].rawSpeech,
        english: cards[idx].english
      }));
      
      if (onProgress) {
        onProgress(
          b, 
          toProcess.length, 
          `AI Generating batch ${Math.floor(b / batchSize) + 1}/${Math.ceil(toProcess.length / batchSize)} (${chunkIndices.length} cards)...`
        );
      }
      
      const prompt = `Generate authentic Japanese example sentences tailored to ${tag} for each of the following words.
Vocabulary list:
${JSON.stringify(chunkCards, null, 2)}
  
Return ONLY a JSON array with an item for each vocabulary word in this exact format:
[
  {
    "idx": 0,
    "wordFurigana": "Word with every individual kanji annotated with Anki furigana brackets like 自[じ] 治[ち] 体[たい]",
    "sentence": "Japanese sentence with target word in <b></b>",
    "sentenceFurigana": "Japanese sentence with every individual kanji annotated with Anki furigana brackets and spaces like 粗[そ] 大[だい]ゴミ and target word bolded like <b> 自[じ] 治[ち] 体[たい]</b>",
    "sentenceMeaning": "Accurate English translation of the sentence"
  }
]`;
  
      const resArray = provider === 'gemini' ? 
        await callGeminiApi(apiKey, model, prompt) : 
        await callOpenAiApi(apiKey, model, prompt);
      
      const items = Array.isArray(resArray) ? resArray : (resArray.cards || resArray.items || [resArray]);
      for (const item of items) {
        const cardIdx = item.idx !== undefined ? item.idx : chunkIndices[0];
        if (cardIdx !== undefined && cards[cardIdx]) {
          const card = cards[cardIdx];
          if (item.wordFurigana) {
            card.wordFurigana = alignSentenceFurigana(item.wordFurigana);
            card.ruby = formatFuriganaToHtml(card.wordFurigana);
          }
          card.sentence = item.sentence || card.sentence;
          card.sentenceFurigana = alignSentenceFurigana(item.sentenceFurigana || card.sentenceFurigana);
          card.sentenceEnglish = item.sentenceMeaning || item.sentenceEnglish || card.sentenceEnglish;
          
          if (card.plain && card.sentence && !card.sentence.includes('<b>')) {
            const escaped = card.plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            card.sentence = card.sentence.replace(new RegExp(`(${escaped})`, 'g'), '<b>$1</b>');
          }
          if (card.plain && card.sentenceFurigana && !card.sentenceFurigana.includes('<b>')) {
            const pattern = escapeWordFuriganaRegex(card.wordFurigana || card.plain);
            const escapedPlain = card.plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp(pattern).test(card.sentenceFurigana)) {
              card.sentenceFurigana = card.sentenceFurigana.replace(new RegExp(`(\\s*${pattern})`, 'g'), '<b>$1</b>');
            } else {
              card.sentenceFurigana = card.sentenceFurigana.replace(new RegExp(`(\\s*${escapedPlain}\\[[^\\]]+\\]|${escapedPlain})`, 'g'), '<b>$1</b>');
            }
          }
        }
      }
    }
  } else {
    for (let i = 0; i < toProcess.length; i++) {
      const idx = toProcess[i];
      const card = cards[idx];
      if (onProgress) {
        onProgress(i + 1, toProcess.length, `Processing card ${i + 1}/${toProcess.length}: ${card.plain}...`);
      }
      
      if (card.sentence && !card.sentenceEnglish) {
        card.sentenceEnglish = await autoTranslateJaToEn(card.sentence);
      } else if (!card.sentence) {
        const res = await generateSentenceForSingleCard(card, provider, apiKey, model, tag);
        card.sentence = res.sentence;
        card.sentenceFurigana = res.sentenceFurigana;
        card.sentenceEnglish = res.sentenceEnglish;
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
  
  if (onProgress) {
    onProgress(toProcess.length, toProcess.length, `Done! Generated sentences for ${toProcess.length} cards.`);
  }
}
  
async function formatNotesWithAi(rawText, provider, apiKey, model) {
  if (provider === 'gemini' || provider === 'openai') {
    if (!apiKey) throw new Error('Please enter your API Key in AI Settings.');
    
    const prompt = `You are an expert Japanese vocabulary curator.
Convert and clean the following messy raw notes into clean vocabulary cards.
Raw notes:
${rawText}

Return ONLY a JSON object with a "cards" array in this exact format:
{
  "cards": [
    {
      "word": "Japanese kanji or plain word",
      "reading": "Reading in hiragana",
      "english": "English meaning",
      "sentence": "Japanese example or explanation sentence (if present)",
      "sentenceMeaning": "English translation of sentence (if present)"
    }
  ]
}`;

    const res = provider === 'gemini' ? 
      await callGeminiApi(apiKey, model, prompt) : 
      await callOpenAiApi(apiKey, model, prompt);
    
    const list = res.cards || res.items || (Array.isArray(res) ? res : []);
    if (!list.length) return rawText;
    
    return list.map(c => {
      let out = `${c.word || ''} [${c.reading || c.word || ''}] ${c.english || ''}`.trim();
      if (c.sentence) {
        out += `\n例文: ${c.sentence}`;
      }
      if (c.sentenceMeaning) {
        out += `\n（${c.sentenceMeaning}）`;
      }
      return out;
    }).join('\n\n');
  } else {
    throw new Error('Please select Gemini or OpenAI and enter your API Key in AI Settings.');
  }
}

  