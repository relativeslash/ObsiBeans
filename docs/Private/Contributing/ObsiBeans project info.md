# ObsiBeans project info

ObsiBeans is an Obsidian plugin project providing a native interface for Beans work tracking. See [[docs/Private/Design/ObsiBeans native workspace proposal.md]] for the accepted v1 target experience and [[docs/Private/Contributing/README.md]] for shared-standard inheritance. This note holds project facts and version selections, not copies of global standards.

## Compatibility baseline

Selected and checked on **2026-10-26 (UTC)**. “Latest” here means the latest public stable release available at selection time, excluding Catalyst/early-access and prerelease builds. These are fixed initial development targets, not floating requirements.

| Component | Selected baseline | Official evidence |
| --- | --- | --- |
| Obsidian Desktop | **1.14.5** | [Public desktop release, 2026-10-22](https://obsidian.md/changelog/2026-10-22-desktop-v1.14.5/); [official changelog](https://obsidian.md/changelog/) |
| Beans CLI | **0.4.2** (tag `v0.4.2`) | [Official v0.4.2 release](https://github.com/hmans/beans/releases/tag/v0.4.2), marked Latest in the [release listing](https://github.com/hmans/beans/releases) |

Obsidian 1.15.0 was listed as Catalyst early access when checked, so it is not the public-stable baseline. Beans main has development beyond v0.4.2; unreleased main is not the selected target.

### Meaning of compatibility

The plugin is intended to work with the selected pair above. Compatibility is a requirement to implement and test, **not a claim of already tested support**. No plugin compatibility tests have run. Older versions, future versions, and Obsidian Mobile are not included in this initial target by implication.

The design currently proposes desktop execution of the local Beans CLI. The baseline does not install or upgrade either application. A developer's installed version is evidence about that machine, not a substitute for this selection.

Before releasing a plugin, verify the Beans CLI/GraphQL contract and native Obsidian workflows on this pair, choose compatible API/build dependencies, and align the plugin manifest and test configuration with the documented support policy. No build toolchain or plugin manifest is established by this documentation update.

### Changes to the baseline

Review upstream release notes before changing these exact targets. Update this note, applicable dependency/manifest pins, and compatibility tests together. Record the selection date, sources, actual test results, and any changed support scope. Do not silently move the baseline whenever upstream publishes a new version.

## Development guidance

[[docs/Private/Guides/ObsiBeans AI working guide.md]] is the canonical AI workflow entry point. Add verified setup/build/test commands and project-specific toolchain choices here when those tools exist; do not invent executable instructions from the proposed architecture.
