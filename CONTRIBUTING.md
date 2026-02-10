# Contributing to Sanctum

Thanks for your interest in contributing!  
This document explains how development is done in this repository, even when working solo.

The goal is to **mirror professional startup workflows** while remaining practical.

---

## 📐 Project Philosophy

- Prefer **clarity over cleverness**
- Optimize for **long-term maintainability**
- Treat documentation as **first-class**
- Use AI tools intentionally, not blindly
- Small, reviewable changes beat large rewrites

---

## 🌿 Branching & Workflow

### Protected `main`

- `main` is protected
- No direct pushes
- All changes go through pull requests

### Standard Flow

1. Create a branch from `main`

   ```bash
   git checkout -b feat/<short-description>
   # or
   git checkout -b fix/<short-description>
