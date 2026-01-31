- ALWAYS USE REAL DATA, DO NOT MAKE UP DATA UNLESS APPROVAL GIVEN
- keep unit test coverage at 90% target (current enforced: 60%, see .plan/tech-debt.md for improvement plan)
- use milliseconds (Date.now()) for all timestamps; normalize Last.fm API seconds on storage
- use nodejs for the back end
- review .plan/ directory and roadmap.md before implementing new features
- keep readme.md up to date with anything needed to know to run the application, including directions how to sign up for any api access needed and directions on how to setup environment and start the application
- always make sure there are no whitespace issues in `git diff` results
- make sure code is safe to commit to public repo, no secrets or api keys
- make sure code compiles successfully
- make sure you remove any temporary debugging code
- reference TEST_STYLE_GUIDE.md when writing tests
- NEVER USE AMEND ON A COMMIT UNLESS EXPLICITLY TOLD TO DO SO
- BEFORE COMITTING YOU MUST MAKE SURE TESTS PASS AND MEET COVERAGE THRESHOLDS WHEN RUN THE SAME WAY AS THE CI PIPELINE
- RUN ALL CHECKS THAT ARE RUN IN THE CI PIPELINE BEFORE COMMITTING
- all data files must include `schemaVersion: 1` as a top-level field
- register new data files in `migrationService.ts` with path, currentVersion, and optional flag
- files that store raw arrays must use `arrayWrapperKey` in registration to wrap as `{schemaVersion: 1, [key]: [...]}` (e.g., `items` or `mappings`)
- use `writeJSONWithBackup()` for critical data files (creates `.bak` before overwriting)
- add new store types to `src/shared/types.ts` extending `VersionedStore` interface
- cache files should have defined retention periods and be added to `cleanupService.ts` if they need automated cleanup
- ALWAYS CHECK IF UI COMPONENTS ALREADY EXIST BEFORE MAKING NEW ONES, (LIKE MODAL AND BUTTONS)
- make sure to check all mappings in the codebase to see if they should be used in current feature working on

## UI Navigation Guidelines
Before adding any new page or navigation item:
1. Ask: "Which area does this belong to?" (Dashboard, Library, Listen, Discover, Marketplace, Settings)
2. Ask: "Can this be a tab/section inside an existing area?"
3. Only add a new top-level area if it represents a genuinely new mental model for users
