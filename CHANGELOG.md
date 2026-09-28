# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Changed
- **BC!** Configuration format changed from list of LLD objects to JSON object

## [v0.2.0] - 2026-09-29
### Changed
- Disable history of raw HTTP responses (dependent items are unaffected by this change)
- **BC!** `{#TYPE}` is now `{#TYPES}` and allows defining multiple checks for the same endpoint

### Fixed
- Description of `CERTIFICATE.NO_DATA_GRACE` documented the wrong severity

## [v0.1.0] - 2026-09-25
### Added
- `http_status` check
- `json_path` check
- `certificate` check

[Unreleased]: https://github.com/we-push-it/zabbix-web-check/compare/v0.2.0...HEAD
[v0.2.0]: https://github.com/we-push-it/zabbix-web-check/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/we-push-it/zabbix-web-check/compare/2d2d04f1...v0.1.0
