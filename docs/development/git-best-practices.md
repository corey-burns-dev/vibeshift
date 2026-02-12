# Professional Git Workflow Guide

Welcome to the "pro" side of Git! This guide outlines the workflows and habits that distinguish experienced developers from beginners.

## 1. The Golden Rule: Linear History

**Beginner:** `git pull` (creates messy "Merge branch 'master' of..." commits)
**Pro:** `git pull --rebase`

### Why?

When you use `git pull`, Git merges the remote changes into your local branch. If you both added commits, this creates a "merge commit" that clutters the history with no real information.
`git pull --rebase` rewinds your local commits, brings in the remote changes, and then replays your work on top. This keeps the history a straight, clean line.

```bash
# The Pro Command
git pull --rebase origin master
```

## 2. Feature Branches

**Beginner:** Working directly on `master`
**Pro:** Creating a branch for *everything*

### Why use branches?

Master should always be deployable. By working in a branch, you can break things safely. It also makes Code Reviews (Pull Requests) possible.

```bash
# Create and switch to a new branch
git checkout -b feat/user-profile

# ... do work ...

# Push the branch
git push -u origin feat/user-profile
```

## 3. Atomic Commits & Messages

**Beginner:** One huge commit "Fixed everything"
**Pro:** Small, logical commits with "Conventional Commits" format.

### Structure

```text
<type>(<scope>): <description>

[optional body]
```

### Types

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Formatting, missing semi-colons, etc.
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `chore:` Build process, dependency updates

### Example

```bash
git commit -m "feat(auth): add login form validation"
git commit -m "fix(header): repair broken navigation link on mobile"
```

## 4. The Interactive Rebase (`rebase -i`)

**Beginner:** Committing "wip", "fix typo", "fix again"
**Pro:** Squashing distinct "wip" commits into one clean commit before pushing.

```bash
# Edit the last 3 commits
git rebase -i HEAD~3
```

*Change `pick` to `squash` (or `s`) to combine a commit into the previous one.*

## 5. Reviewing Changes (`add -p`)

**Beginner:** `git add .` (Blindly adding everything)
**Pro:** `git add -p` (Patch mode)

### Why use patch mode?

This iterates through every change and asks "Stage this hunk?". It forces you to review your code before staging it and allows you to split changes into different commits.

## Summary Checklist

1. [ ] **Pull first:** Always start with `git pull --rebase` (or fetch/rebase).
2. [ ] **Branch:** `git checkout -b feat/my-cool-thing`.
3. [ ] **Work:** Write code.
4. [ ] **Stage:** `git add -p` (Review what you did).
5. [ ] **Commit:** `git commit -m "feat: description"`
6. [ ] **Push:** `git push origin feat/my-cool-thing`
7. [ ] **Merge:** Open a Pull Request on GitHub.
