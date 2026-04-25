# Race Benchmark Source Data Contract

This directory contains source inputs used to generate `src/data/race-ranks.json`
from independent race-result datasets.

## Required input file

Create `public/data/sources/normalized-results.csv` with this header:

```csv
distance,age,gender,finish_time
```

Accepted values:

- `distance`: `5k`, `10k`, `half-marathon`, `marathon`, plus common aliases
- `age`: integer runner age
- `gender`: `male` / `female` (or aliases such as `M`, `F`)
- `finish_time`: `mm:ss` or `hh:mm:ss`

Rows that cannot be normalized are skipped during generation.

## Generation

Run from project root:

```bash
pnpm race-ranks:generate
pnpm race-ranks:validate
```

Outputs:

- `src/data/race-ranks.json`

## Source governance

Before adding new raw inputs, record source details in `docs/race-ranks-pipeline.md`:

- URL and access path
- license / redistribution terms
- attribution requirement
- extraction date
- known caveats
