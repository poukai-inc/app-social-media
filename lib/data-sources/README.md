# Data Sources

External data connectors that feed **content generation**. A Page can attach one
or more data sources; the generation pipeline pulls rows from them and uses the
content as raw material for posts (see `Page.dataSources` in `lib/models/Page.ts`).

This is why `mysql2` is a **production dependency** — it is the driver for the
MySQL connector below, not dead code. (Re: BACKLOG #15.)

## `database.ts` — external SQL connector

Lets a user connect their **own** external database (read-only content source)
so autopost can generate posts from real business data (e.g. latest orders,
new signups, product launches).

- **Engine**: MySQL (via `mysql2/promise`). `DatabaseType` also lists
  `postgresql`/`mongodb` for future connectors; only MySQL is implemented today.
- **Cloud SSL**: auto-enables TLS for managed hosts (TiDB Cloud, PlanetScale,
  AWS RDS, Azure, and `*cloud*`/`*serverless*` hostnames).
- **Exports**: `testConnection`, `executeQuery`, `fetchContentForGeneration`.

### Security model

The query path is **not** a general SQL console — it is defended in depth:

- Table names are validated against `^[a-zA-Z_][a-zA-Z0-9_]{0,63}$`
  (`sanitizeTableName`) — no injection via identifiers.
- Only read queries are intended; see BACKLOG **#112** (AUDIT2-M1) to harden the
  `executeQuery` allow/deny list (block `LOAD_FILE`, `INTO OUTFILE/DUMPFILE`,
  `SLEEP`, `BENCHMARK`, set `multipleStatements: false`).
- Connection strings are user-supplied secrets. They must be **encrypted at
  rest** — tracked in BACKLOG **#114** (AUDIT2-M4); today they are stored on the
  `Page.dataSources[].connectionString` field.

### Adding a new engine

1. Implement a connector module beside `database.ts` (or branch on
   `DatabaseSource.type`).
2. Reuse `sanitizeTableName` / parameterised queries — never interpolate user
   input into SQL.
3. Surface it in the data-source settings UI and `DatabaseType`.

## Related

- `lib/models/Page.ts` — `DataSources` / `DatabaseSource` schema
- `app/api/pages/[id]/data-sources/**` — CRUD + test endpoints
- BACKLOG #15 (dep audit), #112 (query hardening), #114 (encrypt connection strings)
