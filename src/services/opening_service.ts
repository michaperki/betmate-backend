import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export type OpeningEntry = {
  name: string; // e.g., "Italian Game: Two Knights"
  family?: string; // e.g., "Italian Game"
  eco?: string; // e.g., "C55"
  sequence?: string[]; // SAN sequence prefix
};

export type OpeningMatch = {
  name: string;
  family?: string;
  eco?: string;
  confidence: number; // 0..1 based on match depth
};

class OpeningService {
  private entries: OpeningEntry[] = [];
  private loaded = false;

  /** Attempt to load openings from assets; safe no-op if not present. */
  loadOnce() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      // Allow override via OPENING_BOOK_PATH (eco.json, openings.json, .ndjson, .jsonl, or gzipped variants)
      const configured = process.env.OPENING_BOOK_PATH;
      const defaultPath = path.resolve(__dirname, '../assets/openings.json');
      const candidate = configured ? path.resolve(process.cwd(), configured) : defaultPath;
      if (!fs.existsSync(candidate)) {
        // Fallback: try to load TSVs from assets directory (eco/ subdir preferred)
        const ecoDir = path.resolve(__dirname, '../assets/eco');
        this.entries = fs.existsSync(ecoDir)
          ? this.loadTsvDirectory(ecoDir)
          : this.loadTsvDirectory(path.resolve(__dirname, '../assets'));
        return;
      }
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        // If directory, prefer TSVs within
        this.entries = this.loadTsvDirectory(candidate);
        return;
      }
      const lower = candidate.toLowerCase();
      if (lower.endsWith('.json')) {
        const raw = fs.readFileSync(candidate, 'utf-8');
        try {
          const data = JSON.parse(raw);
          this.entries = this.fromGenericJson(data);
          if (!this.entries.length) {
            // If JSON parse yielded nothing, try TSV fallback
            const ecoDir = path.resolve(path.dirname(candidate), 'eco');
            this.entries = fs.existsSync(ecoDir)
              ? this.loadTsvDirectory(ecoDir)
              : this.loadTsvDirectory(path.dirname(candidate));
          }
        } catch {
          const ecoDir = path.resolve(path.dirname(candidate), 'eco');
          this.entries = fs.existsSync(ecoDir)
            ? this.loadTsvDirectory(ecoDir)
            : this.loadTsvDirectory(path.dirname(candidate));
        }
      } else if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) {
        const raw = fs.readFileSync(candidate, 'utf-8');
        const rows = raw.split(/\r?\n/).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        this.entries = this.fromGenericJson(rows);
      } else if (lower.endsWith('.jsonl.gz') || lower.endsWith('.ndjson.gz')) {
        const buf = fs.readFileSync(candidate);
        const text = zlib.gunzipSync(buf).toString('utf-8');
        const rows = text.split(/\r?\n/).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        this.entries = this.fromGenericJson(rows);
      } else if (lower.endsWith('.tsv') || lower.endsWith('.tsv.gz')) {
        const dir = path.dirname(candidate);
        this.entries = this.loadTsvDirectory(dir);
      }
    } catch (_) {
      // ignore
    }
  }

  /**
   * Normalize various JSON opening formats into OpeningEntry[].
   * Supports:
   *  - Our format: { name, family?, eco?, sequence: string[] }
   *  - ECO/niklasf: { eco, name, moves } where moves is a SAN string with move numbers
   */
  private fromGenericJson(data: any): OpeningEntry[] {
    const out: OpeningEntry[] = [];
    if (!Array.isArray(data)) return out;
    for (const row of data) {
      try {
        if (row && Array.isArray(row.sequence) && typeof row.name === 'string') {
          out.push({ name: row.name, family: row.family, eco: row.eco, sequence: row.sequence.map(String) });
          continue;
        }
        // ECO-like shape
        const eco: string | undefined = typeof row?.eco === 'string' ? row.eco : undefined;
        const name: string | undefined = typeof row?.name === 'string' ? row.name : (typeof row?.opening === 'string' ? row.opening : undefined);
        const movesStr: string | undefined = typeof row?.moves === 'string' ? row.moves : (typeof row?.pgn === 'string' ? row.pgn : undefined);
        if (name && movesStr) {
          const seq = this.parseMovesToSanList(movesStr);
          if (seq.length) out.push({ name, eco, sequence: seq });
        }
      } catch {
        // skip bad row
      }
    }
    return out;
  }

  /**
   * Parse a PGN/SAN moves string into a clean SAN list (no move numbers, results, comments).
   */
  private parseMovesToSanList(moves: string): string[] {
    // Remove comments {...} and brackets and results
    const cleaned = moves
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const tokens = cleaned.split(' ');
    const out: string[] = [];
    for (const t of tokens) {
      if (!t) continue;
      // Skip move numbers like 1., 15... etc
      if (/^\d+\.{1,3}$/.test(t)) continue;
      // Skip annotations (?! etc) and NAGs like $1
      if (/^[!?]+$/.test(t) || /^\$\d+$/.test(t)) continue;
      out.push(t);
    }
    return out;
  }

  /**
   * Load TSV files (a.tsv..e.tsv) from directory and convert to entries.
   */
  private loadTsvDirectory(dir: string): OpeningEntry[] {
    try {
      const files = fs.readdirSync(dir).filter(f => /\.[teabc]\.tsv$/.test(f) || /^(a|b|c|d|e)\.tsv$/i.test(f) || f.toLowerCase().endsWith('.tsv'));
      const out: OpeningEntry[] = [];
      for (const f of files) {
        try {
          const content = fs.readFileSync(path.join(dir, f), 'utf-8');
          const lines = content.split(/\r?\n/).filter(Boolean);
          if (!lines.length) continue;
          // first line is header: eco\tname\tpgn
          for (let i = 1; i < lines.length; i += 1) {
            const line = lines[i];
            const cols = line.split('\t');
            if (cols.length < 3) continue;
            const eco = cols[0];
            const name = cols[1];
            const pgn = cols.slice(2).join('\t');
            const seq = this.parseMovesToSanList(pgn);
            if (name && seq.length) out.push({ name, eco, sequence: seq });
          }
        } catch {}
      }
      return out;
    } catch { return []; }
  }

  /** Find the best opening match for a SAN sequence prefix. */
  findByMoves(sanMoves: string[]): OpeningMatch | null {
    this.loadOnce();
    if (!this.entries.length || !sanMoves.length) return null;

    // Longest prefix match wins
    let best: OpeningEntry | null = null;
    let bestLen = 0;
    for (const e of this.entries) {
      const seq = e.sequence || [];
      const len = Math.min(seq.length, sanMoves.length);
      if (!len) continue;
      let ok = true;
      for (let i = 0; i < len; i += 1) {
        if (String(seq[i]) !== String(sanMoves[i])) { ok = false; break; }
      }
      if (ok && len > bestLen) { best = e; bestLen = len; }
    }
    if (!best) {
      // Fallback heuristics for common families based on first move(s)
      const fam = this.heuristicFamily(sanMoves);
      if (fam) return fam;
      return null;
    }
    const confidence = Math.max(0.3, Math.min(1.0, bestLen / Math.max(1, sanMoves.length)));
    return { name: best.name, family: best.family, eco: best.eco, confidence };
  }

  /**
   * Heuristic family detection to increase coverage without a full book.
   */
  private heuristicFamily(san: string[]): OpeningMatch | null {
    const m1 = san[0];
    const m2 = san[1];
    const m3 = san[2];
    const m4 = san[3];
    try {
      if (m1 === 'e4') {
        if (m2 === 'c5') return { name: 'Sicilian Defense', confidence: 0.7 } as OpeningMatch;
        if (m2 === 'e5') {
          if (m3 === 'Nf3' && m4 === 'Nc6') {
            if (san[4] === 'Bc4') return { name: 'Italian Game', confidence: 0.75 } as OpeningMatch;
            if (san[4] === 'Bb5') return { name: 'Ruy Lopez', confidence: 0.75 } as OpeningMatch;
          }
          return { name: 'Open Game', confidence: 0.6 } as OpeningMatch;
        }
        if (m2 === 'e6') return { name: 'French Defense', confidence: 0.7 } as OpeningMatch;
        if (m2 === 'c6') return { name: 'Caro-Kann Defense', confidence: 0.7 } as OpeningMatch;
        if (m2 === 'd5') return { name: 'Scandinavian Defense', confidence: 0.75 } as OpeningMatch;
        if (m2 === 'd6') return { name: 'Pirc Defense', confidence: 0.65 } as OpeningMatch;
      }
      if (m1 === 'd4') {
        if (m2 === 'd5') {
          if (m3 === 'c4') return { name: "Queen's Gambit", confidence: 0.75 } as OpeningMatch;
          return { name: 'Closed Game', confidence: 0.6 } as OpeningMatch;
        }
        if (m2 === 'Nf6') return { name: 'Indian Defense', confidence: 0.7 } as OpeningMatch;
        if (m2 === 'f5') return { name: 'Dutch Defense', confidence: 0.75 } as OpeningMatch;
      }
      if (m1 === 'c4') return { name: 'English Opening', confidence: 0.75 } as OpeningMatch;
      if (m1 === 'Nf3') return { name: 'Reti Opening', confidence: 0.65 } as OpeningMatch;
    } catch {}
    return null;
  }
}

export const openingService = new OpeningService();
export default openingService;
