# Race Ranks Pipeline

This project is migrating from a single third-party benchmark source to an
independent, reproducible benchmark generation workflow.

## Goal

Generate `public/data/race-ranks.csv` for:

- distances: `5k`, `10k`, `half-marathon`, `marathon`
- age groups: `10` through `90` in 5-year steps
- genders: `male`, `female`
- tiers: `beginner`, `novice`, `intermediate`, `advanced`, `elite`

Tier semantics are percentile-based over finish times:

- `elite`: 5th percentile (fastest)
- `advanced`: 20th percentile
- `intermediate`: 50th percentile
- `novice`: 80th percentile
- `beginner`: 95th percentile (slowest)