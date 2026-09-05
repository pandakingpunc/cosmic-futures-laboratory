# GitHub and Zenodo release guide

The project structure is ready for owner review and publication. Author metadata is intentionally unfinished: replace `REPLACE_WITH_RELEASE_AUTHOR` in `CITATION.cff` and `.zenodo.json`. Add only verified author names, affiliations and optional ORCIDs. Update the actual release date if it differs from the prepared date. No repository URL or DOI has been invented.

## Before tagging

1. Review scientific scope and limitations; obtain independent specialist review before claiming externally validated research-grade accuracy.
2. Confirm the source-data version, model documentation, tests, example outputs and license. Preserve `package-lock.json` and `requirements-validation.txt`.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run examples`, `npm run build`, and the optional SciPy reference suite.
4. Fill the author metadata and run `node scripts/release-check.mjs`. The check intentionally fails while placeholders remain.
5. For a public fork, review `.openai/hosting.json`: its deployment ID belongs to the original private site. Remove that ID before registering a distinct hosted instance. Do not archive credentials or `.env` files.
6. Initialize/create the intended public GitHub repository, commit the reviewed source, and tag the exact release as `v0.1.0` (or update all version fields consistently).

## Archive

Use Zenodo's GitHub integration for the chosen repository or manually upload a source archive. A GitHub release and Zenodo software version should correspond to the same tagged source. Include documentation, source, lockfiles, observational metadata, examples and license. Exclude dependencies, `.venv`, `.wrangler`, local caches and temporary files. The public release workflow packages the tagged source; it does not automatically publish to an external service.

After Zenodo assigns a DOI, record the version DOI in the citation metadata for the appropriate release, distinguish it from the concept DOI, and update the recommended citation. Do not invent a DOI or use another software project's identifier.

Recommended citation template:

> [Release author(s)]. Cosmic Futures Laboratory (version 0.1.0), software, 2026. [Zenodo-assigned version DOI].

Public deployment or archival remains an explicit owner action. The application may have a separately hosted private preview; that is not GitHub publication or Zenodo archival.
