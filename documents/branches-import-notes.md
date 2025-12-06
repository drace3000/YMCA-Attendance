## Monroe County YMCA branches import

- Source CSV: `documents/Monroe.Country.YMCA.csv` (`Name, Address, City, State, ZIP, Phone, Description`).
- Branch codes are slugified from names (lowercased, non-alphanumerics → `_`, trimmed underscores).
- Upsert script applied to Supabase project `pgsqtbblahihqesnvwxd` via migration `import_monroe_branches`.
- Branch schema now includes: `code (unique)`, `name`, `address`, `city`, `state`, `zip`, `phone`, `description`.

If adding more branches, follow the same slug rule for `code` and upsert on conflict (`code`).

