# GitHub and Zenodo release guide

The project owner is **Mustafa Karatum**, GitHub username **pandakingpunc**, an **Independent researcher** with no institutional affiliation or ORCID declared. Both citation files contain this supplied metadata; ORCID is omitted. The public repository is [pandakingpunc/cosmic-futures-laboratory](https://github.com/pandakingpunc/cosmic-futures-laboratory).

## Published archive

- Software version: **0.1.0**, published **2026-09-05**.
- Version DOI: [10.5281/zenodo.22343412](https://doi.org/10.5281/zenodo.22343412). Use this DOI when citing this exact version.
- Concept DOI: [10.5281/zenodo.22343411](https://doi.org/10.5281/zenodo.22343411). This identifies the software across its archived versions.
- Archived release: [`v0.1.0.0`](https://github.com/pandakingpunc/cosmic-futures-laboratory/releases/tag/v0.1.0.0), source revision `eaeedceceff2856f9c70743eb538c28dc10e9cde`.

The owner published both `v0.1.0` and `v0.1.0.0` from the same source revision. Zenodo archived the latter; its metadata and the software both use version `0.1.0`. The citation and documentation updates on `main` were added after archival and do not change the existing archive or tags.

The [`v0.1.0.0` release workflow](https://github.com/pandakingpunc/cosmic-futures-laboratory/actions/runs/33965935098) passed its tests, metadata check and build, then failed the tag/version equality check. The [`v0.1.0` release workflow](https://github.com/pandakingpunc/cosmic-futures-laboratory/actions/runs/33965317740) passed for the same source revision. Future release tags must match the package version exactly with the `v` prefix.

## Where to enter publication information

All files below are in the repository root unless a directory is stated.

| Information | Location | Requirement |
| --- | --- | --- |
| Author name | `CITATION.cff`: `authors[].given-names` and `family-names`; `.zenodo.json`: `creators[].name` in `Family, Given` order | Already entered as Mustafa Karatum |
| GitHub account | Owner account `pandakingpunc`; recorded here and in README | Supplied by the owner |
| Public repository URL | `repository-code` in `CITATION.cff`; README; `related_identifiers` in `.zenodo.json` | Set to the verified pandakingpunc/cosmic-futures-laboratory repository |
| ORCID | Add `orcid` to the corresponding author/creator entry in both files | Optional; use an existing verified identifier |
| Affiliation | `affiliation` in the corresponding author/creator entry in both files | Entered as Independent researcher; no institution claimed |
| Other authors | Add entries to both author/creator arrays | Include if applicable |
| Release date/version | `date-released` and `version` in CFF; `publication_date` and `version` in Zenodo JSON | Verify at release time |
| Version DOI | `doi` in `CITATION.cff`; README badge and recommended citation | Set to `10.5281/zenodo.22343412` for version 0.1.0 |

These fields are publication metadata, not simulator settings. When both files are present, Zenodo uses `.zenodo.json` for GitHub archival, so keep author, title, version, date and license synchronized with `CITATION.cff`. The Zenodo JSON deliberately omits a fixed `doi` so that future releases can receive their own version DOI. See the [official Zenodo metadata guide](https://help.zenodo.org/docs/github/describe-software/zenodo-json/).

## Before tagging the next version

1. Review scientific scope and limitations; obtain independent specialist review before claiming externally validated research-grade accuracy.
2. Confirm the source-data version, model documentation, tests, example outputs and license. Preserve `package-lock.json` and `requirements-validation.txt`.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run examples`, `npm run build`, and the optional SciPy reference suite.
4. Review the author metadata, update the version and actual release date in the package and citation files, and remove the previous version's top-level `doi` from `CITATION.cff` until Zenodo assigns the new version DOI. Run `node scripts/release-check.mjs`. The check fails if placeholders remain; it does not create a GitHub repository or publish a Zenodo record.
5. For a public fork, review `.openai/hosting.json`: its deployment ID belongs to the original private site. Remove that ID before registering a distinct hosted instance. Do not archive credentials or `.env` files.
6. Commit the reviewed source to the existing GitHub repository and verify the validation workflow. Confirm that the repository remains enabled in the intended Zenodo account. Tag the exact release using `v` followed by the new software version, keeping all version fields consistent. Publish a new GitHub release for that tag; preserve the existing published tags.

## Archive

Use Zenodo's GitHub integration for the chosen repository or manually upload a source archive. A GitHub release and Zenodo software version should correspond to the same tagged source. Include documentation, source, lockfiles, observational metadata, examples and license. Exclude dependencies, `.venv`, `.wrangler`, local caches and temporary files. The public release workflow packages the tagged source; it does not automatically publish to an external service.

After Zenodo assigns a DOI, record the version DOI in the citation metadata for the appropriate release, distinguish it from the concept DOI, and update the recommended citation. Do not invent a DOI or use another software project's identifier.

Recommended citation for version 0.1.0:

> Karatum, M. (2026). *Cosmic Futures Laboratory: a numerical laboratory for conditional cosmological futures* (Version 0.1.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.22343412

Public deployment or archival remains an explicit owner action. The application may have a separately hosted private preview; that is not GitHub publication or Zenodo archival.
