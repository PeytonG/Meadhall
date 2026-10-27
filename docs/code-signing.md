# Code signing policy

**Status: planned for v1.0.0.** Releases before v1.0.0 (the beta) are **not** code-signed on Windows, so Windows
SmartScreen warns when you run the installer ("Windows protected your PC" → More info → Run anyway). Every release
already has checksums (`SHA256SUMS.txt`) and, from v0.4.0, signed build provenance you can check:

```sh
gh attestation verify Meadhall-Setup-0.4.0.exe --repo PeytonG/Meadhall
```

That proves the file was built by this repository's release workflow from the tagged source.

## From v1.0.0: Windows signing through SignPath

Meadhall will apply (not yet submitted) for free code signing for open source projects from the
[SignPath Foundation](https://signpath.org). Once approved, this is the policy:

- Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
  [SignPath Foundation](https://signpath.org). The publisher shown by Windows is **SignPath Foundation**.
- Only Meadhall's own binaries, built from this repository's source by the GitHub Actions release workflow, are
  signed. SignPath verifies that origin for every signing request.
- Every release that is signed is approved by hand by an approver before signing.
- Signed binaries carry the product name (Meadhall) and version.

### Team roles

| Role | Who |
|---|---|
| Committers and reviewers | [@PeytonG](https://github.com/PeytonG) (owner) |
| Approvers | [@PeytonG](https://github.com/PeytonG) |

Changes from anyone else come in through pull requests and are reviewed before merging. Everyone with these roles
uses multi-factor authentication on GitHub and SignPath.

### Privacy

See the [privacy policy](privacy.md). In short: Meadhall only talks to the Matrix homeserver you choose (and what you
turn on, like link previews or sharing your activity); it has no telemetry.
