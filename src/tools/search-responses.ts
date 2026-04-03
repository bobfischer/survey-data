import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getQuestions, getResponses } from '../db.js';

export const searchResponsesSchema = {
  keyword: z.string().describe('Keyword or phrase to search for in open-ended responses'),
  dataset: z.enum(['all', 'exec']).default('all').describe('Which dataset to use'),
};

export async function handleSearchResponses({ keyword, dataset }: { keyword: string; dataset: 'all' | 'exec' }) {
  const responses = getResponses(dataset);
  const questions = getQuestions();

  // Find open-ended columns: explicit open-ended questions plus any _oe columns
  const openQuestionIds = questions.filter((q) => q.type === 'open').map((q) => q.id);

  // Also look for _oe columns in the response data
  const allColumns = responses.length > 0 ? Object.keys(responses[0]) : [];
  const oeColumns = allColumns.filter((col) => col.endsWith('_oe') || col === 'Q4');

  const searchColumns = [...new Set([...openQuestionIds, ...oeColumns])];
  const lowerKeyword = keyword.toLowerCase();

  const matches: { question_column: string; question_text: string | null; response_text: string; seniority: string; industry: string; company_size: string }[] = [];

  for (const row of responses) {
    for (const col of searchColumns) {
      const val = row[col];
      if (val && val.trim() !== '' && val.toLowerCase().includes(lowerKeyword)) {
        const question = questions.find((q) => q.id === col);
        matches.push({
          question_column: col,
          question_text: question?.text ?? null,
          response_text: val,
          seniority: row['Q1'] ?? '',
          industry: row['Q2'] ?? '',
          company_size: row['Number of Employees'] ?? '',
        });
      }
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { keyword, dataset, total_matches: matches.length, columns_searched: searchColumns, matches },
          null,
          2,
        ),
      },
    ],
  };
}

export function registerSearchResponses(server: McpServer) {
  server.tool(
    'searchResponses',
    'Search open-ended text responses for a keyword or phrase. Returns matching responses with respondent demographics.',
    searchResponsesSchema,
    handleSearchResponses,
  );
}
