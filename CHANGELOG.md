# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-15

### Added
- Dynamic Supabase configuration management in Super Admin panel.
- Visual version indicator below platform name.
- Master database initialization script (`supabase/init_database.sql`).
- Docker deployment support.
- Improved order extraction logic in Telegram webhook.

### Changed
- Refactored project structure to consolidate SQL migrations.
- Updated README with comprehensive deployment instructions.

### Fixed
- Telegram webhook robustness for `ORDER_CONFIRMED` commands.
- Supabase client initialization to support dynamic keys.
