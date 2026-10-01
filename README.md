# Sikke reference-rate backup

Public currency metadata and daily reference rates from [Frankfurter](https://frankfurter.dev/). No app source, credentials, user amounts, favorites, notifications or personal data are stored here.

The scheduled workflow checks the source every four hours. Source publication dates and the actual successful download time are preserved. It does not create intraday prices or change the provider's daily publication cadence. Failed or invalid downloads leave the previous file intact. GitHub schedules can run late, so clients always inspect the stored dates.

Sikke normally queries Frankfurter directly. During an outage it can use this table with an explicit saved-data warning; it never relabels old values as live prices. `data/last-good.json` is also bundled with an application deployment to cover a simultaneous provider and GitHub outage.
