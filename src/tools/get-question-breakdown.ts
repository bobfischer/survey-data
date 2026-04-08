import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getQuestion, getResponses, filterResponses } from '../db.js';

export const getQuestionBreakdownSchema = {
  question_ids: z.union([z.string(), z.array(z.string())]).describe('One or more question IDs (e.g. "Q3" or ["Q3", "Q5", "Q8"])'),
  dataset: z.enum(['all', 'exec']).default('all').describe('Which dataset to use'),
  filter_field: z.string().optional().describe('Demographic field to filter on (e.g. "Q1", "Q2", "Age")'),
  filter_value: z.string().optional().describe('Value to filter for within the filter field'),
};

function breakdownOne(question_id: string, dataset: 'all' | 'exec', filter_field?: string, filter_value?: string) {
  const question = getQuestion(question_id);
  if (!question) return { error: `Question ${question_id} not found` };

  const responses = filter_field && filter_value
    ? filterResponses(dataset, { [filter_field]: filter_value })
    : getResponses(dataset);
  const total = responses.length;

  return { question, responses, total };
}

export async function handleGetQuestionBreakdown({
  question_ids,
  dataset,
  filter_field,
  filter_value,
}: {
  question_ids: string | string[];
  dataset: 'all' | 'exec';
  filter_field?: string;
  filter_value?: string;
}) {
  const ids = Array.isArray(question_ids) ? question_ids : [question_ids];
  const responses = filter_field && filter_value
    ? filterResponses(dataset, { [filter_field]: filter_value })
    : getResponses(dataset);
  const total = responses.length;

  const results = ids.map((qid) => buildBreakdownResult(qid, responses, total, dataset));

  // If single question, return flat; if multiple, return array
  const output = results.length === 1 ? results[0] : results;

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
  };
}

function buildBreakdownResult(question_id: string, responses: Record<string, string>[], total: number, dataset: string) {
  const question = getQuestion(question_id);
  if (!question) return { question_id, error: `Question ${question_id} not found` };

  if (question.type === 'open') {
    const primaryCol = question.columns.find(c => !c.endsWith('_oe')) || question.columns[0];
    const texts = responses.map((r) => r[primaryCol]).filter((v) => v && v.trim() !== '');
    return { question_id, question_text: question.text, type: question.type, dataset, total_respondents: total, response_count: texts.length, responses: texts };
  }

  if (question.type === 'ranking') {
    const columns = question.columns ?? question.options ?? [];
    const items: Record<string, Record<string, number>> = {};
    for (const col of columns) items[col] = {};

    for (const row of responses) {
      for (const col of columns) {
        const val = (row[col] || '').trim();
        if (val) items[col][val] = (items[col][val] || 0) + 1;
      }
    }

    const breakdown = Object.entries(items).map(([item, distribution]) => {
      const respondents = Object.values(distribution).reduce((a, b) => a + b, 0);
      return {
        item, respondents,
        distribution: Object.entries(distribution)
          .map(([value, count]) => ({ value, count, percentage: respondents > 0 ? Math.round((count / respondents) * 1000) / 10 : 0 }))
          .sort((a, b) => b.count - a.count),
      };
    });
    breakdown.sort((a, b) => {
      const aTop = a.distribution.find(d => d.value.includes('High'))?.percentage ?? 0;
      const bTop = b.distribution.find(d => d.value.includes('High'))?.percentage ?? 0;
      return bTop - aTop;
    });

    return { question_id, question_text: question.text, type: question.type, dataset, total_respondents: total, breakdown };
  }

  if (question.type === 'multi') {
    const columns = question.columns ?? question.options ?? [];
    const counts: Record<string, number> = {};
    for (const col of columns) counts[col] = 0;

    for (const row of responses) {
      for (const col of columns) {
        const val = (row[col] || '').trim();
        if (val === 'Selected' || val === '1' || val === 'Yes') counts[col]++;
      }
    }

    const breakdown = Object.entries(counts)
      .map(([option, count]) => ({ option, count, percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count);

    return { question_id, question_text: question.text, type: question.type, dataset, total_respondents: total, breakdown };
  }

  // Single-select
  const primaryCol = question.columns.find(c => !c.endsWith('_oe')) || question.columns[0];
  const counts: Record<string, number> = {};
  for (const row of responses) {
    const val = row[primaryCol];
    if (val && val.trim() !== '') counts[val] = (counts[val] ?? 0) + 1;
  }

  const breakdown = Object.entries(counts)
    .map(([value, count]) => ({ value, count, percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);

  return { question_id, question_text: question.text, type: question.type, dataset, total_respondents: total, breakdown };
}

export function registerGetQuestionBreakdown(server: McpServer) {
  server.tool(
    'getQuestionBreakdown',
    'Get aggregated results for a specific survey question. Supports single-select, multi-select, ranking, and open-ended question types.',
    getQuestionBreakdownSchema,
    handleGetQuestionBreakdown,
  );
}
