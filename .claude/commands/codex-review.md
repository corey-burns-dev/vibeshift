---
command: /codex-review
description: Send the last commit to Codex for review
---

1. Get the diff of the last commit using `git diff HEAD~1`
2. Pipe it to codex with this prompt: "Review this commit. Check for bugs, security issues, performance problems, and missing error handling. Be critical and specific."
3. Display Codex's feedback to me
4. If there are issues, ask if I want you to fix them
