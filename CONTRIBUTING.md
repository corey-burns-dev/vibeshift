# Contributing to Sanctum

Thanks for your interest in contributing!  
This document explains how development is done in this repository, even when working solo.

---

## 📐 Project Philosophy

- Prefer **clarity over cleverness**
- Optimize for **long-term maintainability**
- Treat documentation as **first-class**
- Use AI tools intentionally, not blindly
- Small, reviewable changes beat large rewrites

---

## 🌿 Branching & Workflow

### Protected `master`

- `master` is protected
- No direct pushes
- All changes go through pull requests

### Standard Flow

1. Create a branch from `master`

   ```bash
   git checkout -b feat/<short-description>
   # or
   git checkout -b fix/<short-description>
