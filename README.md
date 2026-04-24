# f2-frontend

## Deploy to GitHub Pages

This project is configured to publish to GitHub Pages for the repository:

- owner: `celonymire`
- repo: `f2`
- URL: `https://celonymire.github.io/f2/`

### First-time setup on GitHub

1. Open repository Settings -> Pages.
2. Set Source to `Deploy from a branch`.
3. Set Branch to `gh-pages` and folder to `/ (root)`.
4. Save.

### Publish

Deployment builds on pushes to `master` and after product sync runs, then publishes `dist` to `gh-pages` via:

```bash
/.github/workflows/deploy-pages.yml
```

You can also trigger it manually from the Actions tab using `workflow_dispatch`.
