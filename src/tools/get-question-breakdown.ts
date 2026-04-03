import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getQuestion, getResponses, filterResponses } from '../db.js';

export const getQuestionBreakdownSchema = {
  question_id: z.string().describe('The question ID (e.g. "Q3")'),
  dataset: z.enum(['all', 'exec']).default('all').describe('Which dataset to use'),
  filter_field: z.string().optional().describe('Demographic field to filter on (e.g. "Q1", "Q2", "Age")'),
  filter_value: z.string().optional().describe('Value to filter for within the filter field'),
};

export async function handleGetQuestionBreakdown({
  question_id,
  dataset,
  filter_field,
  filter_value,
}: {
  question_id: string;
  dataset: 'all' | 'exec';
  filter_field?: string;
  filter_value?: string;
}) {
  const question = getQuestion(question_id);
  if (!question) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Question ${question_id} not found` }) }] };
  }

  const responses =
    filter_field && filter_value
      ? filterResponses(dataset, { [filter_field]: filter_value })
      : getResponses(dataset);

  const total = responses.length;

  if (question.type === 'open') {
    const texts = responses
      .map((r) => r[question_id])
      .filter((v) => v && v.trim() !== '');

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { question_id, question_text: question.text, type: question.type, dataset, total_respondents: total, response_count: texts.length, responses: texts },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (question.type === 'ranking') {
    // For ranking questions, each column represents a ranked item
    // Calculate average rank and distribution for each item
    const columns = question.columns ?? question.options ?? [];
    const items: Record<string, { ranks: number[]; total: number }> = {};

    for (const col of columns) {
      items[col] = { ranks: [], total: 0 };
    }

    for (const row of responses) {
      for (const col of columns) {
        const val = row[col];
        if (val && val.trim() !== '') {
          const rank = parseInt(val, 10);
          if (!isNaN(rank)) {
            items[col].ranks.push(rank);
            items[col].total++;
          }
        }
      }
    }

    const breakdown = Object.entries(items).map(([item, data]) => ({
      item,
      responses: data.total,
      average_rank: data.total > 0 ? Math.round((data.ranks.reduce((a, b) => a + b, 0) / data.total) * 100) / 100 : null,
    }));

    breakdown.sort((a, b) => (a.average_rank ?? 999) - (b.average_rank ?? 999));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { question_id, question_text: question.text, type: question.type, dataset, total_respondents: total, breakdown },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (question.type === 'multi') {
    // Multi-select: each option is a separate column; count respondents who selected each
    const columns = question.columns ?? question.options ?? [];
    const counts: Record<string, number> = {};

    for (const col of columns) {
      counts[col] = 0;
    }

    for (const row of responses) {
      for (const col of columns) {
        const val = row[col];
        if (val && val.trim() !== '' && val !== '0') {
          counts[col]++;
        }
      }
    }

    const breakdown = Object.entries(counts).map(([option, count]) => ({
      option,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }));

    breakdown.sort((a, b) => b.count - a.count);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { question_id, question_text: question.text, type: question.type, dataset, total_respondents: total, breakdown },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Single-select: count each unique value
  const counts: Record<string, number> = {};

  for (const row of responses) {
    const val = row[question_id];
    if (val && val.trim() !== '') {
      counts[val] = (counts[val] ?? 0) + 1;
    }
  }

  const breakdown = Object.entries(counts)
    .map(([value, count]) => ({
      value,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { question_id, question_text: question.text, type: question.type, dataset, total_respondents: total, breakdown },
          null,
          2,
        ),
      },
    ],
  };
}

export function registerGetQuestionBreakdown(server: McpServer) {
  server.tool(
    'getQuestionBreakdown',
    'Get aggregated results for a specific survey question. Supports single-select, multi-select, ranking, and open-ended question types.',
    getQuestionBreakdownSchema,
    handleGetQuestionBreakdown,
  );
}
