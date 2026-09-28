# Hackathon compliance

## New-build declaration

**2026-09-28 development update:** The owner explicitly authorized migrating useful Shop Signal reference logic, synthetic sentiment datasets/results, and a trained English checkpoint into this cloned Escala codebase. That local development now reuses those artifacts; the earlier blanket statement of no prior-artifact reuse is no longer an accurate description of this working tree. No DOCRELAY/SAND source or assets were imported. This migration is recorded as development work, not a claim of a from-scratch hackathon submission or verified event eligibility.

Escala is a new product build created in this workspace for the Sea × OpenAI Regional Codex Hackathon — Vietnam 2026. The workspace began with the Escala handoff document and no application commits.

The implementation, UI, data, workflow details, prompts, schemas, and demo will be created for Escala during the event. The team may use prior experience to inform engineering judgment, but will not reuse existing project artifacts.

## Explicit non-reuse boundary

Do not copy, clone, fork, port, rename, or submit source code, UI components, layouts, API routes, database schemas, prompts, fixtures, datasets, deployment configuration, README text, or generated artifacts from DOCRELAY_MLAI2026 or SAND.

This repository currently contains no imported code from those projects. The synthetic fixtures in `data/demo/` were written for Escala and are not copied datasets.

## Honest demo claims

- Marketplace integration is mocked/local, not live.
- Knowledge documents are synthetic demo content, not official Shopee policy.
- OpenAI generation is planned behind an adapter with a mock fallback; no production accuracy claim is made.
- Urgency is explainable prototype ranking, not a validated business metric.
- External sending and order mutation are disabled by default.
- Seller trust, recommendation quality, and adoption remain to be validated.

## Source-of-truth note

The official event page referenced by the handoff is the source of truth for event rules if any handoff detail becomes stale: https://codexhackathon.sea.com/
