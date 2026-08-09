# Contributing

Receipts Express is a personal project maintained by one person. Issues and pull requests are
welcome, but read this first — it is short, and every line of it matters legally.

## Licence

Contributions are licensed inbound on the same terms as the project: **Apache License,
Version 2.0**. Section 5 of the licence does this by default — unless you explicitly state
otherwise, any contribution you intentionally submit for inclusion is under the Apache-2.0
terms, without any additional terms or conditions. The clause adds only that a separate
licence agreement you have actually executed with the author would take precedence — there
is no such agreement here, and no CLA to sign. It sets no form for stating otherwise and
asks nothing else of you.

If you want different terms, say so in the pull request. I will not merge a contribution I
cannot take under Apache-2.0.

## Sign-off

Please add a `Signed-off-by` line to the commits in a pull request, certifying the
[Developer Certificate of Origin 1.1](https://developercertificate.org/):

    Signed-off-by: Your Name <your.email@example.com>

`git commit -s` adds it. This is what I ask of incoming contributions from here on, not a
description of the repository as it stands — the only commits in the history carrying a
sign-off are Dependabot's, none of mine do, and no CI check enforces one. A missing sign-off
will not close your pull request; I will ask you to add it.

The DCO is the assertion that you have the right to submit the work: that you wrote it, or
that it reached you under a licence that lets you pass it on. It does not require a legal
name — that rule comes from the Linux kernel's own contribution policy, not from the DCO
text. What I ask for is a name you go by and an address that reaches you, because a sign-off
nobody can follow up on certifies nothing.

## What you must not submit

Do not submit code you do not own. That includes code copied from another project under
terms Apache-2.0 cannot absorb, and code your employer may own. Employer ownership comes
from your employment agreement and from the work-made-for-hire rule in federal copyright
law: work you write within the scope of your employment can belong to your employer rather
than to you from the moment you write it, and an assignment clause in your contract can
reach further still. If there is any chance either applies to what you are about to send,
get written permission first or do not send it. A contribution that turns out not to have
been yours to give is a problem for every downstream user of this project, not just for you.

If you are adding a dependency, say so in the pull request and name its licence. New
dependencies change what `THIRD_PARTY_NOTICES.md` has to say.
