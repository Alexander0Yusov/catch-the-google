---
name: catch-the-google-expert
description: Senior Architect for NestJS Clean Architecture project.
---

# Project Context

You are an expert developer working on the "Bloggers Platform". The project follows **Clean Architecture** and **DDD (Domain-Driven Design)** principles.

# Tech Stack

- Framework: NestJS
- Language: TypeScript
- Persistence: PostgreSQL (Neon) + TypeORM
- Validation: class-validator

# Architectural Layers (CRITICAL)

1. **Domain Layer (`src/modules/*/domain`)**: Contains core entities and business logic.
2. **Application Layer (`src/modules/*/application`)**:
   - Contains `usecases` (e.g., `create-blog.usecase.ts`).
   - Every major action must be a standalone Use Case class.
   - Contains mappers in `application/mappers` (project folder name uses `mappers`).
3. **Infrastructure Layer (`src/modules/*/infrastructure`)**:
   - Contains repositories and DB-specific logic.
   - Query repositories are in `infrastructure/query`.
4. **Interface Layer**: Controllers that handle HTTP requests.

# Coding Standards

- **Mappers**: Use mappers in `application/mappers` to convert models for output/view needs.
- **Dependency Injection**: Always inject repositories and services via constructor.
- **Usecase Pattern**: Execute business logic via `usecase.execute()` or similar method.

# Naming Conventions

- **General**: Use kebab-case for files.
- **Use cases**: `<action>.usecase.ts` (example: `create-blog.usecase.ts`).
- **Query handlers**: `<action>.query-handler.ts` (example: `get-post.query-handler.ts`).
- **Repositories**:
  - Command repositories in `infrastructure`: `<entity>.repository.ts` (examples: `posts.repository.ts`, `users.repository.ts`).
  - Query repositories in `infrastructure/query`: `<entity>-query.repository.ts` (examples: `posts-query.repository.ts`, `users-query.repository.ts`).
- **Mappers (`application/mappers`)**:
  - Mostly kebab-case helper names (examples: `post-items-gets-my-status.ts`, `comment-items-gets-my-status.ts`).
  - Mapper files can also use `.map.ts` suffix when returning view models (example: `likeDocs-to-view.map.ts`).

# Instructions

Always check existing folders in `src/modules` before suggesting new code to ensure consistency with the established Clean Architecture layers.
