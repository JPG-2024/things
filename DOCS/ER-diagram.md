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
    }

    web_tasks {
        TEXT url PK
        TEXT tasks_json "NOT NULL DEFAULT '[]'"
        INTEGER updated_at "NOT NULL"
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

    web_templates {
        TEXT id PK
        TEXT name "NOT NULL"
        TEXT description
        TEXT tasks_json "NOT NULL DEFAULT '[]'"
        INTEGER created_at "NOT NULL"
        INTEGER updated_at "NOT NULL"
    }

    web_profile_templates {
        TEXT profile_id PK
        TEXT template_id FK "NOT NULL"
        INTEGER updated_at "NOT NULL"
    }

    web_domains ||--o{ web_profiles : "has"
    web_domains ||--o{ web_articles : "contains"
    web_domains ||--o| web_profile_templates : "linked to"
    web_profiles ||--o{ web_articles : "has"
    web_categories ||--o{ article_category : "assigned to"
    web_articles ||--o{ article_category : "categorized as"
    web_templates ||--o| web_profile_templates : "assigned to"
```

## Relationships Summary

| From | To | Type | FK |
|---|---|---|---|
| web_domains | web_profiles | 1:N | `web_profiles.domain_id` -> `web_domains.id` |
| web_domains | web_articles | 1:N | `web_articles.domain` -> `web_domains.id` |
| web_profiles | web_articles | 1:N | `web_articles.profile` matches `web_profiles.id` (soft) |
| web_categories | article_category | 1:N | `article_category.category_id` -> `web_categories.id` |
| web_articles | article_category | 1:N | `article_category.article_url` -> `web_articles.url` |
| web_templates | web_profile_templates | 1:1 | `web_profile_templates.template_id` -> `web_templates.id` |
| web_domains | web_profile_templates | 1:1 | `web_profile_templates.profile_id` -> `web_domains.id` |
| web_tasks | web_articles | 1:1 | `web_tasks.url` <-> `web_articles.url` (soft) |

> **Notes:**
> - `web_articles.profile` is a soft foreign key (string match, no FK constraint).
> - `web_tasks.url` links to `web_articles.url` by convention, not enforced by a formal FK.
> - `article_category.article_url` references `web_articles.url` by convention (no formal FK constraint).
