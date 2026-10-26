---
# OB-6mu1
title: Register Standards for recursive repository clones
status: completed
type: task
priority: normal
created_at: 2026-10-26T16:31:10Z
updated_at: 2026-10-26T16:32:27Z
---

## Purpose and scope

Register the existing Standards gitlink in the repository-root `.gitmodules`, as requested by the owner, so recursive clones can locate the shared repository. Use its verified origin URL and preserve the indexed Standards revision. Prerequisites: the existing gitlink and accessible Standards repository; no prerequisite beans.

Do not change the primary checkout branch, existing Standards files/HEAD, the submodule pin, or unrelated work. Epic-specific clone naming and agent workflow remain under discussion, not implemented policy in this task.

## Acceptance criteria

- [x] Add a valid path/URL mapping for the existing Standards gitlink without changing its pin.
- [x] Verify recursive cloning in an isolated fixture, or report any external access limitation explicitly.

## Verification and handoff

Check Git config parsing and the indexed gitlink, then test recursive clone setup in a disposable repository without committing in the user's repositories. Review the final diff and leave `.gitmodules` and this bean uncommitted for review.

## Summary of Changes

Added repository-root `.gitmodules` mapping `docs/Private/Contributing/Standards` to its existing origin, `git@github.com:Protomatter-Studio/Standards.git`. No branch override: clones use the parent repository's recorded revision.

Verification:

- Git parsed the path and URL successfully; submodule status recognizes the mapping.
- An isolated temporary Git fixture containing the exact new mapping and indexed gitlink successfully cloned recursively and fetched Standards from GitHub at `e60e60c665747d5350279f449e7ff900ea9d3fc4`; its README was present. The fixture was removed afterwards.
- The first sandboxed network attempt failed on SSH configuration permissions; the approved retry outside the sandbox passed.
- The parent indexed gitlink is unchanged. The existing Standards checkout remains at its pre-task HEAD, `0f6df6fcf0ddc349f563fee037c0479c3f487b75`; it was not reset to the older pin.
- Checked the new config for whitespace errors. Repository-wide diff checking additionally reports a pre-existing trailing blank line in `.gitignore`; left unchanged.

Handoff and limitations:

- `.gitmodules` and this bean remain uncommitted. Recursive clones from the canonical project remote will receive this mapping only after it is committed and published there.
- The configured SSH URL requires appropriate GitHub access. No application tests were needed or run for this registration-only change.
- No epic workspace was created and no workflow standard was changed. Epic-based workspace naming remains a separate policy discussion; no follow-up bean was created.
