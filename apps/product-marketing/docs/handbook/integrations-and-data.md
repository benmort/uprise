# Integrations and your data

Where your data comes from, where it can go, and the habits that stop a campaign's most valuable asset turning into six inconsistent spreadsheets.

## What is already there

You do not import Australia. The civic data is built in from day one:

- **G-NAF addresses** – the national address file, so the doors are real rather than guessed.
- **ASGS statistical geography** – the Bureau's standard framework, so your areas line up with how the country is actually measured.
- **Electoral divisions at every level** – federal, state and local.
- **Politicians, policies and referendum data** – the political context in the same place as everything else.
- **Demographics** – who lives where, not just where they live.

This is the groundwork most campaigns burn a fortnight assembling. Knowing it is there stops you rebuilding it.

## What you bring

Your own list, and whatever comes from the tools you already run. Before connecting anything, decide one thing: **which system is the source of truth for a person's contact details?**

Pick one. Every integration problem that is not a bug is two systems both believing they are authoritative, quietly overwriting each other.

## Sync direction is a decision, not a setting

For each connected source, write down:

- **What flows in** – new supporters, event RSVPs, petition signers.
- **What flows out, if anything** – usually less than people expect.
- **What happens on conflict** – if both sides changed a phone number, which wins.

If you cannot answer the third question, you do not have an integration, you have a race.

## Import discipline

The rules that keep a list clean are boring and they work:

- **One row per person.** Deduplicate before upload.
- **One phone format**, applied consistently.
- **A source column on every record.** Where this person came from. You will want it constantly and cannot reconstruct it later.
- **A date column.** When they entered the list. Recency is the single best predictor of whether they will respond.

Check after every import: row count matches, ten random records look right, expected merges happened. See [Audiences and segments](/docs/audiences-and-segments).

## Getting data out

Results export straight to CSV for the things that live outside the platform – a coalition partner, a mailing house, a scrutineering plan, your own analysis.

Treat every export as a copy of your database that you no longer control. That is not a reason to avoid exporting; it is a reason to be deliberate:

- Export the columns you need, not everything.
- Note who exported what and why.
- Delete the file when the task is done.
- Keep export rights with organisers. See [Team, roles and access](/docs/team-roles-and-access).

## Publishing data on purpose

Polling views can be made public and embedded – dropped into a briefing, a website or a partner's page without exporting screenshots that go stale the moment the numbers move.

This is a genuinely useful campaigning asset: a live, credible picture of the electorate that supporters, media and coalition partners can see for themselves. Just be deliberate about what you make public, and remember that a public view stays public until you change it.

## Data hygiene on a schedule

Once a quarter, thirty minutes:

- How much of the list has never responded to anything?
- How many records are missing a source?
- Which integrations have not synced recently, and does anyone still need them?
- Who has export rights, and should they still?

A list nobody prunes becomes a list nobody trusts, and a list nobody trusts gets replaced by a spreadsheet on somebody's laptop – which is how campaigns end up with six versions of the truth.

## Related

- [Audiences and segments](/docs/audiences-and-segments)
- [Team, roles and access](/docs/team-roles-and-access)
- [Compliance and opt-outs](/docs/compliance-and-opt-outs)
- [Your first 30 days](/docs/your-first-30-days)
