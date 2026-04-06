# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-04-06

### Changed
- Updated `aperiodic-oscillator` to `^0.3.1`.
- Switched TypeScript compilation and module resolution to `nodenext`.
- Enabled ESM package mode via `"type": "module"` and aligned internal/export import paths with explicit `.js` specifiers.

## [0.3.0] - 2026-04-06

### Added
- Initial changelog created following the Keep a Changelog 1.1.0 specification.

### Changed
- Updated dependencies for better input validations when constructing `AperiodicWave`s.

## [0.2.0] - 2026-04-02

### Added
- Refreshed README and API doc comments.

### Changed
- Tightened and simplified TypeScript typing for `Synth` and voice parameter inference.
- Updated runtime and development dependencies.

### Fixed
- Corrected `package.json` entry points (`main` and `exports`).
- Fixed envelope edge cases and voice parameter typing issues.
- Applied `audioDelay` consistently to note release scheduling.
- Validated polyphony as a non-negative integer.
- Fixed TypeDoc symbol warnings in docs builds.

## [0.1.2] - 2024-12-08

### Fixed
- Addressed npm audit issues in dependencies.

## [0.1.1] - 2024-07-14

### Changed
- Updated project dependencies.

## [0.1.0] - 2024-01-09

### Added
- Switched to requiring `aperiodic-oscillator` from npm.
- Added a basic test and introduced a Vitest-based test setup.

## [0.0.2] - 2023-12-07

### Added
- Implemented an `AudioBuffer`-based synth.
- Exposed `AperiodicWave`.

### Fixed
- Ensured disconnect operations happen only once.

## [0.0.1] - 2023-12-02

### Added
- Initial packaged release of the synth library.
