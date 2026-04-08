import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getQuestion, filterResponses } from '../db.js';

export const compareSegmentsSchema = {
  question_id: z.string().describe('The question ID to compare results on (e.g. "Q3")'),
  segment_field: z.string().describe('The demographic field to segment by (e.g. "Q1" for seniority)'),
  segment_a: z.string().describe('First segment value (e.g. "C-suite")'),
  segment_b: z.string().describe('Second segment value (e.g. "Director")'),
  dataset: z.enum(['all', 'exec']).default('all').describe('Which dataset to use'),
};

function buildBreakdown(responses: Record<string, string>[], question: { id: string; type: string; columns?: string[]; options?: string[] }) {
  const total = responses.length;

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

    return Object.entries(counts)
      .map(([option, count]) => ({
        option,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  if (question.type === 'ranking') {
    const columns = question.columns ?? question.options ?? [];
    const items: Record<string, Record<string, number>> = {};
    for (const col of columns) items[col] = {};

    for (const row of responses) {
      for (const col of columns) {
        const val = (row[col] || '').trim();
        if (val) {
          items[col][val] = (items[col][val] || 0) + 1;
        }
      }
    }

    const breakdown = Object.entries(items).map(([item, distribution]) => {
      const respondents = Object.values(distribution).reduce((a, b) => a + b, 0);
      return {
        item,
        respondents,
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

    return breakdown;
  }

  if (question.type === 'open') {
    const primaryCol = question.columns?.find((c: string) => !c.endsWith('_oe')) || question.columns?.[0] || question.id;
    const texts = responses
      .map((r) => r[primaryCol])
      .filter((v) => v && v.trim() !== '');
    return { response_count: texts.length, responses: texts };
  }

  // Single-select — use the actual column name, not question ID
  const primaryCol = question.columns?.find((c: string) => !c.endsWith('_oe')) || question.columns?.[0] || question.id;
  const counts: Record<string, number> = {};
  for (const row of responses) {
    const val = row[primaryCol];
    if (val && val.trim() !== '') counts[val] = (counts[val] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([value, count]) => ({
      value,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function handleCompareSegments({
  question_id,
  segment_field,
  segment_a,
  segment_b,
  dataset,
}: {
  question_id: string;
  segment_field: string;
  segment_a: string;
  segment_b: string;
  dataset: 'all' | 'exec';
}) {
  const question = getQuestion(question_id);
  if (!question) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Question ${question_id} not found` }) }] };
  }

  const responsesA = filterResponses(dataset, { [segment_field]: segment_a });
  const responsesB = filterResponses(dataset, { [segment_field]: segment_b });

  const result = {
    question_id,
    question_text: question.text,
    type: question.type,
    dataset,
    segment_field,
    segments: {
      [segment_a]: {
        total_respondents: responsesA.length,
        breakdown: buildBreakdown(responsesA, question),
      },
      [segment_b]: {
        total_respondents: responsesB.length,
        breakdown: buildBreakdown(responsesB, question),
      },
    },
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export function registerCompareSegments(server: McpServer) {
  server.tool(
    'compareSegments',
    'Compare two respondent segments side-by-side on a specific question. Useful for seeing how different demographics answered.',
    compareSegmentsSchema,
    handleCompareSegments,
  );
}
