# F2 Frontend

Astro app containing the pace calculator and race benchmark table.

## Commands

All commands run from project root.

| Command | Action |
| :-- | :-- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start local server |
| `pnpm build` | Build production output |
| `pnpm preview` | Preview production build |
| `pnpm astro check` | Run Astro + type checks |
| `pnpm race-ranks:generate` | Generate `public/data/race-ranks.csv` from normalized source results |
| `pnpm race-ranks:validate` | Validate schema and rank ordering in `public/data/race-ranks.csv` |

## Race Rank Data Pipeline

The benchmark CSV is generated from normalized input race-result records.

1. Prepare `public/data/sources/normalized-results.csv`
2. Run `pnpm race-ranks:generate`
3. Run `pnpm race-ranks:validate`

Reference docs:

- `docs/race-ranks-pipeline.md`
- `public/data/sources/README.md`
