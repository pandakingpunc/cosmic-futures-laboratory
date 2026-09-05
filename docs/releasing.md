# GitHub and Zenodo release guide

The project structure is ready for owner review and publication. The owner supplied the name **Mustafa Karatum** and GitHub username **pandakingpunc**. Both citation files now contain this author name. Add any additional authors and optional verified affiliations/ORCIDs before publication. Update the actual release date if it differs from the prepared date. A public repository name has not yet been selected; no repository URL or DOI has been invented.

## Where to enter publication information

All files below are in the repository root unless a directory is stated.

| Information | Location | Requirement |
| --- | --- | --- |
| Author name | `CITATION.cff`: `authors[].given-names` and `family-names`; `.zenodo.json`: `creators[].name` in `Family, Given` order | Already entered as Mustafa Karatum |
| GitHub account | Owner account `pandakingpunc`; recorded here and in README | Supplied by the owner |
| Public repository URL | Add `repository-code` to `CITATION.cff`; update README; add an appropriate `related_identifiers` entry to `.zenodo.json` | Set after the repository name and actual URL are established |
| ORCID | Add `orcid` to the corresponding author/creator entry in both files | Optional; use an existing verified identifier |
| Institution | Add `affiliation` to the corresponding author/creator entry in both files | Optional; omit when there is no affiliation to declare |
| Other authors | Add entries to both author/creator arrays | Include if applicable |
| Release date/version | `date-released` and `version` in CFF; `publication_date` and `version` in Zenodo JSON | Verify at release time |
| DOI | Add the actual assigned DOI to citation metadata after archival | Assigned by Zenodo; do not invent it |

These fields are publication metadata, not simulator settings. When both files are present, Zenodo uses `.zenodo.json` for GitHub archival, so keep it synchronized with `CITATION.cff`. See the [official Zenodo metadata guide](https://help.zenodo.org/docs/github/describe-software/).

## Before tagging

1. Review scientific scope and limitations; obtain independent specialist review before claiming externally validated research-grade accuracy.
2. Confirm the source-data version, model documentation, tests, example outputs and license. Preserve `package-lock.json` and `requirements-validation.txt`.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run examples`, `npm run build`, and the optional SciPy reference suite.
4. Review the author metadata and run `node scripts/release-check.mjs`. The check fails if placeholders remain; it does not create a GitHub repository or publish a Zenodo record.
5. For a public fork, review `.openai/hosting.json`: its deployment ID belongs to the original private site. Remove that ID before registering a distinct hosted instance. Do not archive credentials or `.env` files.
6. Initialize/create the intended public GitHub repository, commit the reviewed source, and tag the exact release as `v0.1.0` (or update all version fields consistently).

## Archive

Use Zenodo's GitHub integration for the chosen repository or manually upload a source archive. A GitHub release and Zenodo software version should correspond to the same tagged source. Include documentation, source, lockfiles, observational metadata, examples and license. Exclude dependencies, `.venv`, `.wrangler`, local caches and temporary files. The public release workflow packages the tagged source; it does not automatically publish to an external service.

After Zenodo assigns a DOI, record the version DOI in the citation metadata for the appropriate release, distinguish it from the concept DOI, and update the recommended citation. Do not invent a DOI or use another software project's identifier.

Recommended citation template:

> Karatum, Mustafa. Cosmic Futures Laboratory (version 0.1.0), software, 2026. [Add the Zenodo-assigned version DOI after archival].

Public deployment or archival remains an explicit owner action. The application may have a separately hosted private preview; that is not GitHub publication or Zenodo archival.
