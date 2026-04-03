import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getResponses } from '../db.js';

const DEMOGRAPHIC_FIELDS = ['Q1', 'Q2', 'Age', 'Gender', 'US Region', 'US State', 'Number of Employees', 'Job Title'] as const;

export const getDemographicsSchema = {
  field: z.enum(DEMOGRAPHIC_FIELDS).describe('Demographic field to break down'),
  dataset: z.enum(['all', 'exec']).default('all').describe('Which dataset to use'),
};

export async function handleGetDemographics({ field, dataset }: { field: string; dataset: 'all' | 'exec' }) {
  const responses = getResponses(dataset);
  const total = responses.length;
  const counts: Record<string, number> = {};

  for (const row of responses) {
    const val = row[field];
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

  const missing = total - breakdown.reduce((sum, b) => sum + b.count, 0);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { field, dataset, total_respondents: total, unique_values: breakdown.length, missing_or_blank: missing, breakdown },
          null,
          2,
        ),
      },
    ],
  };
}

export function registerGetDemographics(server: McpServer) {
  server.tool(
    'getDemographics',
    'Get a demographic breakdown of respondents by a specific field (seniority, industry, age, gender, region, state, company size, or job title).',
    getDemographicsSchema,
    handleGetDemographics,
  );
}
