/*
 * Smart search for the study room (no AI, no tokens): splits the lesson guide and the teacher's materials into
 * short passages and ranks them against the student's question with BM25. Only the best few passages are sent to
 * the AI, never the whole lesson — this is what keeps each answer cheap.
 */

export type Passage = { id: string; source: string; text: string };

const STOP = new Set(
  (
    "the a an and or of to in on for is are was were be been it this that these those with as by at from what how why which who when " +
    "can do does did i you we they he she not no yes if then than so about into over more most very also just " +
    "va yoki bu shu u ular biz siz men nima qanday nega qaysi kim qachon uchun bilan da ga ni ning dan ham emas bor yo'q " +
    "edi bo'ladi qiladi kerak mumkin agar lekin ammo endi yana juda eng har bir"
  ).split(" ")
);

/** Lower case, letters/digits only (Uzbek o' g' kept as one word), stop words removed, crude stem (first 6 chars). */
export function tokenize(value: string): string[] {
  return (value.toLowerCase().replace(/[ʻʼ‘’`]/g, "'").match(/[\p{L}\p{N}']+/gu) ?? [])
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map((word) => (word.length > 6 ? word.slice(0, 6) : word));
}

/** Splits text into passages of about `size` characters on paragraph boundaries. */
export function splitPassages(source: string, value: string, size = 900): Passage[] {
  const paragraphs = value.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const passages: Passage[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) passages.push({ id: `${source}#${passages.length + 1}`, source, text: current.trim() });
    current = "";
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > size * 1.5) {
      push();
      for (let start = 0; start < paragraph.length; start += size) {
        current = paragraph.slice(start, start + size);
        push();
      }
      continue;
    }
    if (current.length + paragraph.length > size) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  push();
  return passages;
}

/** BM25 ranking. Returns the best passages (score > 0) up to `limit` and a total character budget. */
export function rankPassages(query: string, passages: Passage[], { limit = 4, maxChars = 3600 } = {}) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || !passages.length) return [];
  const docs = passages.map((passage) => tokenize(passage.text));
  const avg = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length || 1;
  const df = new Map(terms.map((term) => [term, docs.filter((doc) => doc.includes(term)).length]));
  const k1 = 1.4;
  const b = 0.75;
  const scored = passages.map((passage, index) => {
    const doc = docs[index];
    let score = 0;
    for (const term of terms) {
      const tf = doc.filter((word) => word === term).length;
      if (!tf) continue;
      const idf = Math.log(1 + (passages.length - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.length) / avg)));
    }
    return { passage, score };
  });
  const picked: Array<{ passage: Passage; score: number }> = [];
  let used = 0;
  for (const entry of scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score)) {
    if (picked.length >= limit || used + entry.passage.text.length > maxChars) continue;
    picked.push(entry);
    used += entry.passage.text.length;
  }
  return picked;
}

/** Same question asked differently ("What is X?" / "what is x") → the same cache key. */
export function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/[ʻʼ‘’`]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
}
