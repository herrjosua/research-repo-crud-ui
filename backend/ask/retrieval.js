const crypto = require('crypto');
const {
    chunkRecord, embeddingText, queryEmbeddingText, isMetadataPassage, participantsHeader,
} = require('./corpus');

function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Brute-force nearest records: scores every passage against the query and
// ranks records by their single best passage (so one long record can't crowd
// out the rest), best first. Each entry is { record, score, passages }, its
// passages as { passage, score }, best first. At ~100 records / a few hundred
// passages this is well under a millisecond; no vector DB needed.
function rankRecords(queryVector, passages) {
    const byRecord = new Map();
    for (const passage of passages) {
        const score = cosineSimilarity(queryVector, passage.vector);
        if (!byRecord.has(passage.record.id)) byRecord.set(passage.record.id, { record: passage.record, passages: [] });
        byRecord.get(passage.record.id).passages.push({ passage, score });
    }
    const ranked = [...byRecord.values()];
    for (const r of ranked) {
        r.passages.sort((a, b) => b.score - a.score);
        r.score = r.passages[0].score;
    }
    return ranked.sort((a, b) => b.score - a.score);
}

// The top `k` records' best passages, best first.
function rankPassages(queryVector, passages, k) {
    return rankRecords(queryVector, passages).slice(0, k).map((r) => r.passages[0]);
}

function hashText(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

// In-memory embedding cache keyed by a hash of the exact text embedded.
//
// Lazy, not at startup: nothing is embedded until the first question, so the
// server starts instantly and doesn't need Ollama running unless someone
// actually uses Ask the Repo. On every question the corpus is re-read from
// export_records.py (cheap) and only passages whose text isn't already cached
// get embedded — so the first question embeds the whole corpus (a few
// seconds warm), later ones embed nothing, and a record edited through the
// CRUD routes gets re-embedded on the next question without any
// invalidation hook. Entries for passages no longer in the corpus are
// dropped, so the cache never outgrows the repo.
//
// Metadata sections (rosters, link lists; corpus.js isMetadataPassage) are
// chunked like everything else but neither embedded nor returned in
// `passages`; `records` still holds every record whole, for the provenance
// links (ask/provenance.js). A cited passage's contextBefore/After are its
// real neighbours in the record, metadata or not. Each passage of a raw
// session carries `participants`, its roster as one line (or null).
function createEmbeddingIndex({ embed, loadRecords, batchSize = 64 }) {
    const vectorsByHash = new Map();
    // Refreshes run one at a time, so two questions arriving together don't
    // both embed the same new passages.
    let refreshTail = Promise.resolve();

    async function refresh() {
        const records = await loadRecords();
        const passages = [];
        for (const record of records) {
            const chunks = chunkRecord(record);
            const participants = participantsHeader(record);
            chunks.forEach((chunk, i) => {
                if (isMetadataPassage(record, chunk)) return;
                const text = embeddingText(record, chunk);
                passages.push({
                    record,
                    chunk,
                    previous: chunks[i - 1] || null,
                    next: chunks[i + 1] || null,
                    participants,
                    text,
                    hash: hashText(text),
                });
            });
        }

        const missing = [...new Map(
            passages.filter((p) => !vectorsByHash.has(p.hash)).map((p) => [p.hash, p.text]),
        )];
        for (let i = 0; i < missing.length; i += batchSize) {
            const batch = missing.slice(i, i + batchSize);
            const vectors = await embed(batch.map(([, text]) => text));
            batch.forEach(([hash], j) => vectorsByHash.set(hash, vectors[j]));
        }

        const live = new Set(passages.map((p) => p.hash));
        for (const hash of vectorsByHash.keys()) {
            if (!live.has(hash)) vectorsByHash.delete(hash);
        }

        for (const passage of passages) passage.vector = vectorsByHash.get(passage.hash);
        return { passages, records, embedded: missing.length };
    }

    return {
        refresh() {
            const run = refreshTail.then(refresh, refresh);
            refreshTail = run.catch(() => {});
            return run;
        },

        async embedQuery(question) {
            const [vector] = await embed([queryEmbeddingText(question)]);
            return vector;
        },

        get size() {
            return vectorsByHash.size;
        },
    };
}

module.exports = {
    cosineSimilarity, rankRecords, rankPassages, createEmbeddingIndex, hashText,
};
