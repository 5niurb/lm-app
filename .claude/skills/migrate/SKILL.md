---
name: migrate
description: Apply a SQL migration to Supabase with logging and verification
argument-hint: [sql-file-path or migration-name]
disable-model-invocation: false
allowed-tools: Bash, Read, Grep
---

# Supabase Migration

Apply a SQL migration to the Supabase database with proper logging and verification.

## Arguments

- SQL file path or migration description: $ARGUMENTS

## Supabase Project Details

- **Project ID:** skvsjcckissnyxcafwyr
- **URL:** https://skvsjcckissnyxcafwyr.supabase.co

## Steps

1. **Read the SQL:**
   - If a file path is given, read the file
   - If a description is given, generate the SQL
   - Show the SQL to the user for review before applying

2. **Apply the migration** using the Supabase MCP tool:
   - Use `apply_migration` for DDL (CREATE, ALTER, DROP)
   - Use `execute_sql` for DML (INSERT, UPDATE, DELETE)
   - Name migrations in snake_case: e.g., `add_consent_signatures_table`

3. **Verify the migration:**
   - List tables to confirm changes: `list_tables`
   - Run a quick query to verify data if applicable
   - Check for any advisory notices: `get_advisors` (security + performance)

4. **Log the migration:**
   - Record what was applied in SESSION_NOTES.md
   - Note the migration name and what it changed

## Schema Files

- Core schema: `api/db/schema.sql`
- Phase 1C schema: `api/db/schema-phase1c.sql`
- Seed data: `supabase/seed.sql`

## Important

- Always review SQL before applying — migrations are not easily reversible
- Use `apply_migration` (not `execute_sql`) for DDL so migrations are tracked
- Check `get_advisors` after DDL changes — catches missing RLS policies, indexes, etc.
- All tables should have RLS enabled
