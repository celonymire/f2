# f2-frontend

## Deploy to GitHub Pages

This project is configured to publish to GitHub Pages for the repository:

- owner: `celonymire`
- repo: `f2`
- URL: `https://celonymire.github.io/f2/`

### First-time setup on GitHub

1. Open repository Settings -> Pages.
2. Set Source to `GitHub Actions`.
4. Save.

### Publish

Deployment runs automatically on every push to `master` via:

```bash
/.github/workflows/deploy-pages.yml
```

You can also trigger it manually from the Actions tab using `workflow_dispatch`.
