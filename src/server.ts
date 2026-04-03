import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListQuestions } from './tools/list-questions.js';
import { registerGetQuestionBreakdown } from './tools/get-question-breakdown.js';
import { registerCompareSegments } from './tools/compare-segments.js';
import { registerGetSurveySummary } from './tools/get-survey-summary.js';
import { registerSearchResponses } from './tools/search-responses.js';
import { registerGetDemographics } from './tools/get-demographics.js';

export const TOOL_REGISTRATIONS = [
  registerListQuestions,
  registerGetQuestionBreakdown,
  registerCompareSegments,
  registerGetSurveySummary,
  registerSearchResponses,
  registerGetDemographics,
] as const;

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'survey-data',
    version: '1.0.0',
  });

  for (const register of TOOL_REGISTRATIONS) {
    register(server);
  }

  return server;
}
