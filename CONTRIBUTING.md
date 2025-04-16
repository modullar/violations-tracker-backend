# Contributing to Violations Tracker

Thank you for considering contributing to the Violations Tracker project. This document provides guidelines and workflows for contributing to this project.

## Development Workflow

We follow a Git-flow inspired branching strategy:

- `main` - Production-ready code
- `develop` - Main development branch
- `feature/*` - Feature branches
- `bugfix/*` - Bug fix branches
- `hotfix/*` - Urgent fixes for production

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/violations-tracker-backend.git`
3. Add the original repository as upstream: `git remote add upstream https://github.com/originalowner/violations-tracker-backend.git`
4. Create a new branch from `develop`: `git checkout -b feature/your-feature-name develop`

## Environment Setup

1. Create appropriate environment files:
   - `.env.development` for local development
   - `.env.test` for running tests
   - `.env.staging` for staging (if needed)

2. Install dependencies: `npm install`

3. Start the development server: `npm run dev`

## CI/CD Pipeline

Our CI/CD pipeline consists of:

### For all branches and pull requests:
- Automated testing
- Code linting
- Test coverage reporting

### For the `develop` branch:
- Automated deployment to the staging environment

### For the `main` branch (future):
- Automated deployment to production environment (to be implemented)

## Pull Request Process

1. Create a branch from `develop` for your changes
2. Make your changes following the coding standards
3. Write or update tests as needed
4. Ensure all tests pass: `npm test`
5. Update documentation if necessary
6. Push your changes to your fork
7. Create a pull request to the `develop` branch of the original repository
8. Wait for the CI pipeline to complete
9. Address any review comments

## Testing

- Write unit tests for all new functionality
- Ensure existing tests pass before submitting a PR
- Aim to maintain or improve test coverage
- Run the test suite with: `npm test`
- Check test coverage with: `npm run test:coverage`

## Coding Standards

- Follow existing code style and conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Use async/await for asynchronous code

## Commit Messages

Write clear, concise commit messages that explain the "why" behind your changes:

```
feature: Add pagination to violations API

- Add limit and page parameters
- Update response to include pagination metadata
- Add tests for pagination functionality
```

## Questions

If you have any questions about the contribution process, open an issue or contact the maintainers directly.

Thank you for contributing to the Violations Tracker project!