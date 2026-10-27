const STOP_WORDS = new Set([
  "the","a","an","and","or","but","if","then","else","for","with","without","from","into","onto","over","under","about","above","below","after","before","during","through","between","among","within","without","that","this","these","those","is","are","was","were","be","been","being","to","of","in","on","at","by","as","it","its","itself","he","she","they","them","their","his","her","your","you","we","us","our","i","me","my","mine","do","does","did","have","has","had","can","could","should","would","will","may","might","must","not","no","yes","also","just","more","most","very","than","too","such","same","any","all","each","every","few","many","some","other","another","because","while","where","when","what","who","which","how","why","there","here","into","out","up","down","left","right","once","upon","along","across","around","against","via","using","used","make","made","takes","take","work","works","working","developed","developing","using","through","based","build","built","building","create","created","creating"
])

function normalizeText(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim()
}

function tokenize(text = "") {
  const normalized = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")

  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
}

function extractKeywords(text = "") {
  const tokens = tokenize(text)
  return [...new Set(tokens)]
}

function splitIntoChunks(text = "", chunkSize = 220) {
  const cleaned = normalizeText(text)
  if (!cleaned) return []

  const sentences = cleaned.split(/(?<=[.!?])\s+|\n+/)
  const chunks = []
  let current = ""

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length > chunkSize && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = candidate
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks.filter((chunk) => chunk.length > 40)
}

function computeChunkScore(chunk = "", jobKeywords = []) {
  const chunkTokens = extractKeywords(chunk)
  if (!chunkTokens.length) return 0

  const overlap = chunkTokens.filter((token) => jobKeywords.includes(token))
  const directMatches = overlap.length
  const ratio = jobKeywords.length ? overlap.length / Math.max(1, jobKeywords.length) : 0
  const coverage = chunkTokens.length ? directMatches / chunkTokens.length : 0
  const phraseBonus = jobKeywords.some((keyword) => chunk.toLowerCase().includes(keyword)) ? 1.5 : 0

  return directMatches + (ratio * 3) + (coverage * 2) + phraseBonus
}

function retrieveRelevantContext({ resume = "", selfDescription = "", jobDescription = "" }) {
  const jobKeywords = extractKeywords(jobDescription)
  const sources = [
    { label: "resume", text: resume },
    { label: "self_description", text: selfDescription },
    { label: "job_description", text: jobDescription }
  ]

  const rankedChunks = []

  for (const source of sources) {
    const chunks = splitIntoChunks(source.text)

    for (const chunk of chunks) {
      const score = computeChunkScore(chunk, jobKeywords)
      if (score > 0 || chunk.length > 180) {
        rankedChunks.push({
          source: source.label,
          text: chunk,
          score
        })
      }
    }
  }

  if (!rankedChunks.length) {
    return normalizeText([
      resume,
      selfDescription,
      jobDescription
    ].filter(Boolean).join("\n\n")) || "No candidate or job context available for retrieval."
  }

  const topChunks = rankedChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  return topChunks
    .map(({ text, score, source }) => `[${source} | relevance=${score.toFixed(2)}]\n${text}`)
    .join("\n\n")
}

module.exports = {
  retrieveRelevantContext,
  extractKeywords,
  splitIntoChunks,
  tokenize
}
