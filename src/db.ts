import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Question {
  id: string;           // e.g. "Q3", "Q5", "SQ1"
  text: string;         // the question text (before :: or _option)
  type: 'single' | 'multi' | 'ranking' | 'open';
  options: string[];    // for multi/ranking: the option labels
  columns: string[];    // the actual CSV column names for this question
}

export interface SurveyStore {
  allResponses: Record<string, string>[];
  execOnly: Record<string, string>[];
  questions: Question[];
  demographics: string[];
}

// ---------------------------------------------------------------------------
// Known demographic columns (appear after the survey questions)
// ---------------------------------------------------------------------------

const DEMOGRAPHIC_FIELDS = [
  'Age',
  'Gender',
  'Household income US',
  'Education Level',
  'Ethnicity (Simplified)',
  'Race',
  'US Region',
  'US State',
  'Employment Status',
  'Number of Employees',
  'Job Title',
];

// Columns that are metadata / not survey questions and not demographics
const META_COLUMNS = new Set([
  'transid',
  'ID',
  'Time Started',
  'Time Finished',
  'Weight',
  'quota_id',
  'Country',
]);

// ---------------------------------------------------------------------------
// CSV loading
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');

function loadCsv(filename: string): Record<string, string>[] {
  const filepath = path.join(DATA_DIR, filename);
  const raw = readFileSync(filepath, 'utf-8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

// ---------------------------------------------------------------------------
// Question index builder
// ---------------------------------------------------------------------------

/**
 * The question ID regex: matches SQ1, Q1, Q2, ... Q24 etc. at the start of a
 * column header, followed by a colon.
 */
const QUESTION_ID_RE = /^(S?Q\d+):\s*/;

function buildQuestionIndex(headers: string[]): Question[] {
  // Group columns by question ID
  const groups = new Map<string, string[]>();
  const orderSeen: string[] = [];

  for (const col of headers) {
    const match = col.match(QUESTION_ID_RE);
    if (!match) continue;
    const qid = match[1];
    if (!groups.has(qid)) {
      groups.set(qid, []);
      orderSeen.push(qid);
    }
    groups.get(qid)!.push(col);
  }

  const questions: Question[] = [];

  for (const qid of orderSeen) {
    const columns = groups.get(qid)!;

    // Filter out _oe companion columns — they'll be attached separately
    const nonOeColumns = columns.filter(c => !c.endsWith('_oe'));
    const oeColumns = columns.filter(c => c.endsWith('_oe'));

    // ---------------------------------------------------------------
    // Determine question type
    // ---------------------------------------------------------------

    const isRanking = nonOeColumns.some(c => c.includes(' :: '));
    const isMulti = !isRanking && nonOeColumns.length > 1 && nonOeColumns.some(c => c.includes('_'));
    const isOpenOnly =
      nonOeColumns.length === 0 && oeColumns.length > 0;
    const isOpenByContent =
      nonOeColumns.length === 1 &&
      oeColumns.length === 0 &&
      isOpenEndedText(nonOeColumns[0]);

    if (isRanking) {
      // Ranking question: columns have " :: ItemLabel:"
      const text = extractQuestionText(nonOeColumns[0], '::');
      const options = nonOeColumns.map(c => {
        const idx = c.indexOf(' :: ');
        if (idx === -1) return c;
        let label = c.slice(idx + 4);
        // Strip trailing colon
        if (label.endsWith(':')) label = label.slice(0, -1);
        return label.trim();
      });
      questions.push({ id: qid, text, type: 'ranking', options, columns });
    } else if (isMulti) {
      // Multi-select: columns have "_OptionText" suffix
      const text = extractQuestionText(nonOeColumns[0], '_');
      const options = nonOeColumns.map(c => {
        const baseQ = extractQuestionTextRaw(c);
        let rest = c.slice(baseQ.length);
        // Strip any parenthetical like " (select all that apply)" between
        // the question mark and the _ option separator
        rest = rest.replace(/^\s*\([^)]*\)\s*/, '');
        // rest starts with "_OptionText" — strip leading _ and whitespace
        const label = rest.replace(/^[\s_]+/, '').replace(/_oe$/, '');
        return label.trim();
      }).filter(o => o.length > 0);
      questions.push({ id: qid, text, type: 'multi', options, columns });
    } else if (isOpenOnly || isOpenByContent) {
      const text = extractQuestionText((nonOeColumns[0] || oeColumns[0]), null);
      questions.push({ id: qid, text, type: 'open', options: [], columns });
    } else {
      // Single-select (possibly with a paired _oe column)
      // If the only non-_oe column ends in _oe, it's open-ended
      const mainCol = nonOeColumns[0] || oeColumns[0];
      const text = extractQuestionText(mainCol, null);

      // Standalone _oe that isn't an "Other_oe" companion means open-ended
      if (oeColumns.length > 0 && nonOeColumns.length === 1 && !oeColumns[0].includes('_Other_oe')) {
        // Single-select with an open-ended "other" write-in
        questions.push({ id: qid, text, type: 'single', options: [], columns });
      } else {
        questions.push({ id: qid, text, type: 'single', options: [], columns });
      }
    }
  }

  return questions;
}

/**
 * Decide if a single column (no _oe suffix) is open-ended based on name.
 * Heuristics: contains "briefly describe", "please explain", etc.
 */
function isOpenEndedText(col: string): boolean {
  const lower = col.toLowerCase();
  return (
    lower.includes('briefly describe') ||
    lower.includes('please explain') ||
    lower.includes('please describe') ||
    lower.includes('in your own words')
  );
}

/**
 * Extract the human-readable question text from a column header.
 * Strips the "QN: " prefix and everything after the first separator
 * ("::" for rankings, " _" for multi-select options).
 */
function extractQuestionText(col: string, separator: string | null): string {
  // Remove Q-ID prefix
  let text = col.replace(QUESTION_ID_RE, '');

  if (separator === '::') {
    const idx = text.indexOf(' :: ');
    if (idx !== -1) text = text.slice(0, idx);
  } else if (separator === '_') {
    // For multi-select, the option is appended after " _" or "?" followed by "_"
    // Find the question mark or the pattern " _"
    const qIdx = text.indexOf('?');
    if (qIdx !== -1) {
      text = text.slice(0, qIdx + 1);
    } else {
      const uIdx = text.indexOf(' _');
      if (uIdx !== -1) text = text.slice(0, uIdx);
    }
  } else {
    // For single-select / open-ended: remove trailing _oe
    text = text.replace(/\s*_oe$/, '');
  }

  return text.trim();
}

/**
 * Return the "base question" portion of a column name, up to and including the
 * question mark (if any) plus the space before the underscore separator.
 * This is used to split multi-select column names into question + option.
 */
function extractQuestionTextRaw(col: string): string {
  // Find the question-mark boundary
  const qIdx = col.indexOf('?');
  if (qIdx !== -1) {
    // Return through the "?" (the option text follows after " _")
    return col.slice(0, qIdx + 1);
  }
  // Fallback: find first " _" as the separator
  const uIdx = col.indexOf(' _');
  if (uIdx !== -1) return col.slice(0, uIdx);
  return col;
}

// ---------------------------------------------------------------------------
// Store singleton
// ---------------------------------------------------------------------------

let _store: SurveyStore | null = null;

function initStore(): SurveyStore {
  const allResponses = loadCsv('all-responses.csv');
  const execOnly = loadCsv('exec-only.csv');

  // Derive headers from the larger dataset
  const headers = allResponses.length > 0 ? Object.keys(allResponses[0]) : [];

  const questions = buildQuestionIndex(headers);

  // Identify which demographic columns actually exist in the data
  const headerSet = new Set(headers);
  const demographics = DEMOGRAPHIC_FIELDS.filter(f => headerSet.has(f));

  return { allResponses, execOnly, questions, demographics };
}

function ensureStore(): SurveyStore {
  if (!_store) {
    _store = initStore();
  }
  return _store;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getStore(): SurveyStore {
  return ensureStore();
}

export function getQuestions(): Question[] {
  return ensureStore().questions;
}

export function getQuestion(id: string): Question | undefined {
  return ensureStore().questions.find(q => q.id === id);
}

export function getResponses(dataset: 'all' | 'exec'): Record<string, string>[] {
  const store = ensureStore();
  return dataset === 'all' ? store.allResponses : store.execOnly;
}

export function getDemographicFields(): string[] {
  return ensureStore().demographics;
}

/**
 * Filter responses by matching field values.
 *
 * `filters` is a map like `{ "Q1": "C-suite", "Q2": "Healthcare" }`.
 * - For question IDs (e.g. "Q1"), the filter matches against the primary
 *   (first non-_oe) column for that question using substring matching.
 * - For demographic field names (e.g. "Age"), it matches the named column
 *   using substring matching.
 */
export function filterResponses(
  dataset: 'all' | 'exec',
  filters: Record<string, string>,
): Record<string, string>[] {
  const store = ensureStore();
  const rows = dataset === 'all' ? store.allResponses : store.execOnly;

  if (Object.keys(filters).length === 0) return rows;

  // Resolve each filter key to the actual column name(s) to check
  const resolvedFilters: { column: string; value: string }[] = [];

  for (const [key, value] of Object.entries(filters)) {
    // Is it a question ID?
    const question = store.questions.find(q => q.id === key);
    if (question) {
      // Use the first non-_oe column as the target
      const col = question.columns.find(c => !c.endsWith('_oe')) || question.columns[0];
      resolvedFilters.push({ column: col, value });
      continue;
    }

    // Is it a demographic field name?
    const headerSet = new Set(
      rows.length > 0 ? Object.keys(rows[0]) : [],
    );
    if (headerSet.has(key)) {
      resolvedFilters.push({ column: key, value });
      continue;
    }

    // Try partial match on column headers (e.g. "Industry" matching a column
    // containing that word)
    const allHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
    const match = allHeaders.find(h => h.toLowerCase().includes(key.toLowerCase()));
    if (match) {
      resolvedFilters.push({ column: match, value });
    }
    // If no match found, silently skip (no rows will be incorrectly excluded)
  }

  return rows.filter(row =>
    resolvedFilters.every(({ column, value }) => {
      const cell = row[column] ?? '';
      return cell.toLowerCase().includes(value.toLowerCase());
    }),
  );
}
