# Team, roles and access

Who can see what, who can do what, and how to keep both correct as the team changes shape mid-campaign.

## The three roles

- **Owner** – the account holder. Controls billing, branding and the things you cannot undo. Keep this to one or two people.
- **Organiser** – runs the work. Cuts turf, builds audiences, sends blasts, reads results, manages volunteers.
- **Volunteer** – does the work. Sees their own shifts and turf, records conversations, and does not see the whole database.

Most access problems come from putting everyone in the middle role because it is easier than thinking about it. Resist that for the first month, when the shape of the team is still moving.

## Grant the least that lets someone work

The test is not "do I trust this person" – it is "does this person need this to do their job today". Trusted people leave laptops on trains. A volunteer who only knocks doors does not need the export button, and giving it to them is a risk you are carrying for no benefit.

Two practical rules:

- **Data export is an organiser capability.** The moment a full list can be exported by anyone, you have as many copies of your database as you have volunteers.
- **Billing and branding sit with the owner.** Not because others would misuse them, but because a change there affects everything downstream.

## Bringing people in

**Invitations** put someone in directly with the role you choose. Use these when you know who the person is.

**Join-request approval** lets people ask, and you approve. Use it behind any public sign-up link. Approve in batches at a set time rather than as they trickle in – it is faster and you make more consistent decisions.

Set the role at the point of approval, not later. "I'll fix the permissions afterwards" is how everybody ends up an organiser.

## Onboarding is part of access

Access without orientation produces a person who can do damage and does not know it. The getting-started checklist gives new members a path through their first steps instead of a dashboard and a shrug. Let it run – do not tell people to skip it.

## Offboarding, which everyone forgets

Campaigns end. People move on mid-campaign, sometimes badly. Have a routine:

- **Remove access the day someone stops, not the week after.** This is not a judgement about them; it is hygiene.
- **Check exports.** If they had export rights, note what leaves with them.
- **Reassign their work.** Their turf, their claimed conversations in the shared inbox, their shifts. Work assigned to a departed person is invisible work.

A monthly pass over the member list takes ten minutes and catches everything.

## Roles change; review them

The volunteer who has run six shifts should probably be an organiser by shift eight. The organiser who joined for one campaign phase may not need that access in the next. Review at the same time every month, alongside the offboarding pass.

## What the UI gate is and is not

Hiding a button is a usability decision, not a security boundary – the API is what actually enforces permissions, and it checks every request regardless of what the interface showed. That matters for how you reason about risk: assume anyone with an account could attempt anything their role allows, and set the role accordingly.

## Related

- [Growing a volunteer team](/docs/growing-a-volunteer-team)
- [Your first 30 days](/docs/your-first-30-days)
- [Compliance and opt-outs](/docs/compliance-and-opt-outs)
- [Integrations and your data](/docs/integrations-and-data)
