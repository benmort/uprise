# Building a branching survey

A survey is the instrument your program learns with. Build it badly and every conversation you have is worth less than it should be. This is how to build one that follows the conversation and still produces comparable data.

## Start from the decision, not the question

Write down the decision the data has to support before you write a single question. "Which streets do we return to?" is a decision. "How do people feel about the campaign?" is not.

Every question then has to earn its place by feeding that decision. If you cannot say what you would do differently based on the answer, cut it.

## Keep it to three or four questions

A doorstep conversation has a natural length and it is shorter than you think. Three questions is comfortable. Four is the ceiling. Five is where the volunteer starts guessing answers to get to the end.

Branching helps here: a survey with eight questions in it can still ask any one person only three, if the branches are right.

## Use the question types deliberately

- **Yes/no** to open. It is the lowest-friction thing you can ask and it gives you a clean fork.
- **Single choice** to sort. This is your workhorse – the support question almost always belongs here.
- **Multi choice** when more than one answer is genuinely true, like which issues matter. Resist using it as a lazy catch-all; multi-select data is harder to read.
- **Text** for one thing only – the comment you could not have predicted. One text field per survey. Two is a transcription exercise.

## Branch on the answer that changes the conversation

Per-option skip logic means each choice can route to a different next question. Use it where the conversation genuinely forks:

- A supporter gets asked to volunteer.
- An opponent gets asked why, once, gently.
- An undecided gets the issue question, because that is the one that tells you what would move them.

**Use terminal branches to stop early.** If someone says they are moving out of the electorate, end the survey there. Marching them through three more questions produces bad data and a worse impression.

## Wire the answers to what happens next

An answer that only lands in a database is half an answer. Each option can carry:

- **A canned reply**, fired automatically over SMS – the right follow-up sent the instant someone answers.
- **A disposition**, so the answer feeds straight into how the contact is scored on the five-point scale.

Set that up once and the survey stops being a form. Someone taps an option, the right message goes out, and the contact is scored – all from the same choice. See [Reading your results](/docs/reading-your-results) for how those dispositions roll up.

## Run it on both channels

The same survey works on the doors and over text. Build one instrument, not two that drift apart. It means the results from a Saturday canvass and a Tuesday text blast are directly comparable, because they are literally the same questions and the same branches.

Do write for both, though. A question that reads fine when spoken can be ambiguous on a screen. Read every question twice: once as a volunteer would say it, once as a recipient would read it.

## Test it on ten people before two thousand

Run it with your own team first. You are looking for three things: a branch that goes somewhere silly, a question people ask you to explain, and an option nobody ever picks. Fix those and the instrument is ready.

## Common failure modes

- **The double-barrelled question.** "Do you support the campaign and want to volunteer?" produces data you cannot use.
- **Options that overlap.** If two options could both be right, volunteers will pick inconsistently.
- **No "other".** Real people do not fit your list; without an escape hatch they get forced into the nearest wrong box.
- **Changing the survey mid-program.** You have just made this week's data incomparable with last week's. If you must change it, note the date and treat it as a new series.

## Related

- [Running a doorknock weekend](/docs/running-a-doorknock-weekend)
- [Launching an SMS program](/docs/launching-an-sms-program)
- [Reading your results](/docs/reading-your-results)
- [Audiences and segments](/docs/audiences-and-segments)
