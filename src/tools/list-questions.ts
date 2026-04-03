import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getQuestions } from '../db.js';

export const listQuestionsSchema = {
  type: z.enum(['single', 'multi', 'ranking', 'open']).optional().describe('Filter by question type'),
};

export async function handleListQuestions({ type }: { type?: 'single' | 'multi' | 'ranking' | 'open' }) {
  let questions = getQuestions();

  if (type) {
    questions = questions.filter((q) => q.type === type);
  }

  const summary = questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    optionCount: q.options?.length ?? 0,
  }));

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ total: summary.length, questions: summary }, null, 2) }],
  };
}

export function registerListQuestions(server: McpServer) {
  server.tool('listQuestions', 'List all survey questions with their IDs, text, and type. Optionally filter by question type.', listQuestionsSchema, handleListQuestions);
}
