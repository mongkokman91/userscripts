# userscripts

Canonical home for personal and orphaned Violentmonkey userscripts.

## Policy

- Third-party scripts with a trustworthy upstream updater stay upstream-managed and are not mirrored here merely for synchronization.
- Personal/custom/orphan scripts live in `scripts/` and use the raw GitHub file as both `@updateURL` and `@downloadURL`.
- Within the same logical script lineage, the highest version is authoritative.
- Superseded scripts are removed from the active inventory; Git history preserves prior revisions.
- Violentmonkey/Dropbox sync is optional transport, not the source of truth for code.

## Managed scripts

See `manifest.json` for the canonical active inventory in this repository.
