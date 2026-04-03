import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getQuestions, getResponses } from '../db.js';

export const getSurveySummarySchema = {
  dataset: z.enum(['all', 'exec']).default('all').describe('Which dataset to use'),
};

function countField(responses: Record<string, string>[], field: string): { value: string; count: number; percentage: number }[] {
  const total = responses.length;
  const counts: Record<string, number> = {};

  for (const row of responses) {
    const val = row[field];
    if (val && val.trim() !== '') {
      counts[val] = (counts[val] ?? 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([value, count]) => ({
      value,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function handleGetSurveySummary({ dataset }: { dataset: 'all' | 'exec' }) {
  const responses = getResponses(dataset);
  const questions = getQuestions();

  const questionTypeCounts: Record<string, number> = {};
  for (const q of questions) {
    questionTypeCounts[q.type] = (questionTypeCounts[q.type] ?? 0) + 1;
  }

  const result = {
    dataset,
    total_respondents: responses.length,
    total_questions: questions.length,
    question_types: questionTypeCounts,
    seniority_breakdown: countField(responses, 'Q1'),
    industry_breakdown: countField(responses, 'Q2'),
    company_size_breakdown: countField(responses, 'Number of Employees'),
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export function registerGetSurveySummary(server: McpServer) {
  server.tool(
    'getSurveySummary',
    'Get a high-level overview of the survey: total respondents, question count, and breakdowns by seniority, industry, and company size.',
    getSurveySummarySchema,
    handleGetSurveySummary,
  );
}
