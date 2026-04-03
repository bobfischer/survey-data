# Survey Data MCP Server

MCP server for querying Eliassen 2026 IT Leadership Pulse Survey data conversationally.

## Tech Stack

- TypeScript, Node.js (ESM with `"type": "module"`)
- Express 5, @modelcontextprotocol/sdk, Zod, csv-parse
- In-memory CSV data (loaded at startup)

## Commands

- `npm run dev` — run the MCP server (port 3005)
- `npm run build` — compile TypeScript to dist/
- `npm start` — run compiled dist/index.js
- `npm test` — run tests

## Architecture

```
src/
├── index.ts              # Express + MCP server (stateless per request)
├── server.ts             # MCP server factory + tool registrations
├── db.ts                 # CSV loader, question parser, filter/query functions
└── tools/
    ├── list-questions.ts       # List all survey questions
    ├── get-question-breakdown.ts # Aggregated results for a question
    ├── compare-segments.ts     # Compare two respondent segments
    ├── get-survey-summary.ts   # High-level survey overview
    ├── search-responses.ts     # Search open-ended text responses
    └── get-demographics.ts     # Demographic breakdowns
data/
├── all-responses.csv     # ~1000 respondents
└── exec-only.csv         # ~205 exec-only respondents
```

## Data Model

Two datasets: `all` (all respondents) and `exec` (executive-only subset).

25 questions across 4 types:
- **single** — single-choice (e.g., Q1 seniority, Q2 industry)
- **multi** — multi-select with Selected/Not Selected columns (e.g., Q3 department focus)
- **ranking** — priority rankings (e.g., Q5 tech investments)
- **open** — free-text responses (e.g., Q4 modernization plans)

Demographic fields available for filtering: Q1 (seniority), Q2 (industry), Age, Gender, US Region, US State, Number of Employees, Job Title.

## Survey Topics

- Q3: Department focus areas for next 12 months
- Q5: Technology investment priorities (ranking)
- Q6: Cybersecurity budget allocation
- Q7-Q10: AI adoption, ROI, outcomes, barriers
- Q11-Q14: Shadow AI / non-tech department AI procurement
- Q15: Roadblocks to achieving goals
- Q16: Department struggles
- Q17-Q20: Skill gaps, impact, and remediation plans
- Q21-Q24: Budget allocation and trajectory
