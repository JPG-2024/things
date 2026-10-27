# Database ER Diagram

Source: `src-tauri/src/web_store.rs`

```mermaid
erDiagram

    web_domains {
        TEXT id PK
        TEXT name "NOT NULL"
        INTEGER count "NOT NULL DEFAULT 0"
        TEXT profile_picture
        TEXT url
        INTEGER updated_at "NOT NULL"
    }

    web_profiles {
        TEXT id PK
        TEXT name "NOT NULL"
        TEXT domain_id FK "NOT NULL"
        INTEGER count "NOT NULL DEFAULT 0"
        TEXT profile_picture
        TEXT url
        INTEGER updated_at "NOT NULL"
    }

    web_articles {
        TEXT id PK
        TEXT url "NOT NULL UNIQUE"
        TEXT domain FK
        INTEGER created_at "NOT NULL DEFAULT 0"
        TEXT title
        TEXT thumbnail
        TEXT content
        TEXT media_directory
        TEXT main_color
        TEXT profile FK
        TEXT embedding_source_text
        INTEGER updated_at "NOT NULL"
        INTEGER viewed "NOT NULL DEFAULT 0"
        TEXT date
        TEXT summary
        INTEGER analysis_divisor
        TEXT mode
        INTEGER profile_rank
    }

    web_categories {
        TEXT id PK
        TEXT name "NOT NULL"
        TEXT description
        INTEGER last_modified "NOT NULL"
        INTEGER deleted_at
    }

    article_category {
        TEXT article_url PK "NOT NULL"
        TEXT category_id PK "NOT NULL"
    }

    profile_category {
        TEXT profile_id PK "NOT NULL"
        TEXT category_id PK "NOT NULL"
    }

    category_exemplars {
        TEXT id PK
        TEXT category_id FK "NOT NULL"
        TEXT article_url "NOT NULL"
        INTEGER window_index "NOT NULL DEFAULT 0"
        TEXT text "NOT NULL"
        TEXT model_name
        INTEGER model_dimensions
        INTEGER created_at "NOT NULL"
        INTEGER updated_at "NOT NULL"
    }

    article_windows {
        TEXT id PK
        TEXT article_url "NOT NULL"
        INTEGER window_index "NOT NULL"
        INTEGER start_offset "NOT NULL"
        INTEGER end_offset "NOT NULL"
        TEXT payload "NOT NULL"
        INTEGER created_at "NOT NULL"
        INTEGER updated_at "NOT NULL"
    }

    web_domains ||--o{ web_profiles : "has"
    web_domains ||--o{ web_articles : "contains"
    web_profiles ||--o{ web_articles : "has"
    web_categories ||--o{ article_category : "assigned to"
    web_articles ||--o{ article_category : "categorized as"
    web_categories ||--o{ profile_category : "assigned to"
    web_categories ||..o{ category_exemplars : "exemplified by (soft)"
    web_articles ||..o{ category_exemplars : "draws exemplars from (soft)"
    web_articles ||..o{ article_windows : "analysed as (soft)"
```

## Relationships Summary

| From           | To                 | Type | FK                                                                |
| -------------- | ------------------ | ---- | ----------------------------------------------------------------- |
| web_domains    | web_profiles       | 1:N  | `web_profiles.domain_id` -> `web_domains.id`                      |
| web_domains    | web_articles       | 1:N  | `web_articles.domain` -> `web_domains.id`                         |
| web_profiles   | web_articles       | 1:N  | `web_articles.profile` matches `web_profiles.id` (soft)           |
| web_categories | article_category   | 1:N  | `article_category.category_id` -> `web_categories.id`             |
| web_articles   | article_category   | 1:N  | `article_category.article_url` -> `web_articles.url` (soft)       |
| web_categories | profile_category   | 1:N  | `profile_category.category_id` -> `web_categories.id` (formal FK) |
| web_domains    | profile_category   | 1:N  | `profile_category.profile_id` matches `web_domains.id` (soft)     |
| web_profiles   | profile_category   | 1:N  | `profile_category.profile_id` matches `web_profiles.id` (soft)    |
| web_categories | category_exemplars | 1:N  | `category_exemplars.category_id` -> `web_categories.id` (soft)    |
| web_articles   | category_exemplars | 1:N  | `category_exemplars.article_url` -> `web_articles.url` (soft)     |
| web_articles   | article_windows    | 1:N  | `article_windows.article_url` -> `web_articles.url` (soft)        |

> **Notes:**
>
> - `web_articles.profile` is a soft foreign key (string match, no FK constraint).
> - `profile_category.profile_id` is a soft key shared by domains and channels:
>   stored lowercase, matched case-insensitively. It is the filter source for
>   the dashboard's category facet (stored links only, never derived from the
>   entity's articles).
> - `article_category.article_url` and the `*_url` columns of
>   `category_exemplars`/`article_windows` reference `web_articles.url` by
>   convention (no formal FK constraint); `article_category` and
>   `profile_category` do carry a formal FK to `web_categories.id`.
