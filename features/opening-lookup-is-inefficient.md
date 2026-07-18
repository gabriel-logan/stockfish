# Opening Lookup Is Inefficient

- [ ] Resolved

`openings.ts` contains a large dataset, and `getOpeningName` performs a linear `find`.

This function is called during renders and analysis flows; it should use a precomputed map keyed by FEN.
