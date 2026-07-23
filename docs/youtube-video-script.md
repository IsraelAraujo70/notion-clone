# YouTube Video Script: I Got Laid Off, So I Built Notion

- Snapshot date: July 23, 2026
- Target length: 14 to 16 minutes
- Language: English
- Format: talking head, live product demo, code and Git B-roll

## Packaging

Recommended title:

> I Got Laid Off, So I Built Notion From Scratch

Alternative titles:

- I Cloned Notion to Fight Impostor Syndrome
- I Tried to Build Notion. The Scope Creep Won.
- What Building a Notion Clone Taught Me About Real Software

Recommended thumbnail text:

> I BUILT NOTION?

Thumbnail composition: Israel on the left, the Reason editor and Kanban board on
the right, with a small `challenge.md` label crossed out by `SCOPE CREEP`.

Core promise: this is not a tutorial or a feature dump. It is the story of using
a difficult clone to rebuild confidence after a layoff, then discovering that
the invisible systems under Notion are much harder than the interface.

## Recording Setup

Prepare this state before recording:

1. One owner account and one invited member in separate browser profiles.
2. A workspace named `Building Reason`.
3. A page named `Why I built this`, with headings, a checklist, a code block, an
   image, a Mermaid diagram, and a nested page.
4. A database named `Video backlog`, populated with rows in at least three
   statuses so both table and board views look useful.
5. A private page that can be shared by a public link and then revoked.
6. A Reason AI conversation that can safely demonstrate a read action and a
   proposed write that requires approval.
7. A page or database row with a pull request linked through the GitHub App.
8. DevTools prepared with network throttling or an offline toggle for the
   reconnect demonstration.

Do not expose API keys, MCP tokens, session cookies, private email addresses, or
the GitHub App private key. Record sensitive settings screens with test data or
crop them out.

## Full Script

### 0:00 to 0:35: Cold open

**ON CAMERA**

Two weeks ago, I got laid off.

And once the meetings, tickets, and company context disappeared, I was left with
an uncomfortable question: can I actually build good software on my own?

That is impostor syndrome in its purest form.

So I decided to answer it in the least reasonable way possible. I tried to build
Notion.

Not just the editor UI. I wanted blocks, nested pages, real-time collaboration,
permissions, search, AI, mobile, and eventually even code review.

**SCREEN**

Fast montage: typing in the editor, two browsers syncing, Reason AI requesting
approval, the Kanban view, the Android client, dashboard tabs, and a pull request
diff.

**ON CAMERA**

This is Reason, and this is what happened when a portfolio challenge turned into
a real product.

### 0:35 to 1:35: The challenge and the first lie

**SCREEN**

Open the historical `challenge.md` with:

```bash
git show 4e69f65:challenge.md
```

Highlight:

- "Do not treat this challenge as a UI-only clone."
- "Version 1 is a web application only."
- "Notion-style databases ... are explicitly out of scope."

**VOICEOVER**

I started with a file called `challenge.md`. The rule that mattered most was
this: a text editor with a sidebar is a costume. The challenge is the system
underneath it.

The plan was a web-only version. Databases were explicitly out of scope. A
desktop client was only a future idea.

You can probably see where this is going.

**SCREEN**

Cut from "web application only" to the Android app and Electron window. Cut from
"databases ... out of scope" to the Kanban board.

**VOICEOVER**

Fourteen days later, the repository had a mobile client, an Electron spike,
inline databases, Kanban, an MCP server, AI approvals, persistent tabs, a GitHub
App, and a pull request review interface.

That sentence about controlling scope aged terribly.

But before the scope creep, I needed the foundation.

### 1:35 to 3:15: Everything is a block

**SCREEN**

Open `Why I built this`. Create text using only the keyboard. Demonstrate:

- `/` to open the block menu
- `#` followed by Space for a heading
- a to-do item
- indentation and outdentation
- drag-and-drop
- a nested page
- undo and redo

**VOICEOVER**

In Reason, everything is a block. A paragraph is a block. A to-do is a block.
Even a page is a block whose content is an ordered list of child blocks.

That sounds simple until editing begins.

Pressing Enter can create a sibling, create a child, or split text. Backspace can
delete an empty block or merge two blocks. Indentation changes parenthood.
Dragging changes both membership and ordering. Undo has to reverse the exact
operation, not just restore whatever the UI happens to remember.

So I stopped treating the editor as a pile of React state. Every change became
one of five typed operations: insert, update, move, delete, or restore.

**SCREEN**

Show `docs/protocolo.md`, then briefly show:

- `packages/core/src/engine/tree.ts`
- `packages/core/src/engine/undo.ts`
- `backend/src/domain/block.rs`

**VOICEOVER**

The TypeScript client and the Rust backend implement the same semantics. The
client applies an operation immediately so typing never waits for the network.
The backend authorizes it, validates the tree, persists the block change and the
operation log in one transaction, and returns an acknowledgement.

This protocol became the spine of the whole product. Web, mobile, AI, and MCP
all had to use it. No special back door.

### 3:15 to 4:35: Real-time is a recovery problem

**SCREEN**

Show the same page in two browser profiles. Type and move blocks in the first
window. Show them appearing in the second. Then take the second window offline,
make several changes in the first, and reconnect it.

**VOICEOVER**

The obvious part of collaboration is WebSocket broadcasting. The hard part is
everything that happens when the connection is unreliable.

Every accepted operation receives a monotonic sequence number inside its
workspace. Every client remembers the last contiguous sequence it has applied.
After a disconnect, it asks for everything after that cursor.

Live events are buffered while the missing range is recovered. Duplicate
operations are ignored by operation ID. Property conflicts use last-writer-wins
versions at the property level.

**SCREEN**

Show the second browser catching up and converging without a refresh. Briefly
show `frontend/cypress/e2e/m3-sync.cy.ts`.

**VOICEOVER**

My first big lesson was that real-time collaboration is not a WebSocket feature.
It is an ordering, idempotency, and recovery feature that happens to use a
WebSocket.

### 4:35 to 5:35: Permissions have to follow the data

**SCREEN**

Use global search. Open a result. Share a page publicly, open it in a private
window, revoke the link, and show that it stops working. Briefly show trash and
restore.

**VOICEOVER**

Once multiple users existed, every read path became a security decision.

Pages are private by default. Search is scoped to memberships. Trashed ancestors
must hide their entire subtree. Public links are read-only and revocable. AI
context, WebSocket recovery, media URLs, and MCP tools all have to enforce the
same workspace boundary.

It is easy to put an authorization check on the page route and still leak data
through search, sync, an image URL, or an AI citation. The useful rule became:
permissions do not belong to the screen. They follow the data through every
path that can expose it.

### 5:35 to 7:30: AI without a second write path

**SCREEN**

Open the fixed Reason AI tab. Ask:

> Read my "Why I built this" page and turn its lessons into a short launch
> checklist on a new page.

Show tool activity, the proposed operations, and the approval UI. Choose `Allow
once`. Open the created page. Then ask a read-only question that returns clickable
citations.

**VOICEOVER**

AI was the flagship feature, but I did not want a chatbot glued to the side of
the editor.

The assistant can read pages, search the workspace, answer with citations, and
propose changes. But a proposal is not a write. It gets no sequence number, it
does not enter the operation log, and collaborators never see it.

The user can reject it, allow it once, or allow future proposals only inside the
current conversation. After approval, permissions are checked again and every
change goes through the same operation use case as a human edit.

That means AI changes participate in synchronization, audit history, and undo.
The model is not trusted with a database shortcut. It is another client of the
product protocol.

For workspace Q&A, embeddings live in the same PostgreSQL database through
pgvector. A worker updates them asynchronously, and retrieval is filtered by
workspace permissions.

**SCREEN**

Show `backend/src/application/ai/use_case.rs`, the operation approval UI, and
`frontend/cypress/e2e/m5-ai.cy.ts`.

**VOICEOVER**

This also produced one of my favorite bugs.

The AI reported that it had created a page, but the page looked empty. The first
assumption was a rendering problem. The database told a different story: the
blocks were there.

The model had emitted a Notion-like `rich_text` shape, while the editor's
canonical contract expected `text` for text blocks and `title` for pages.

The permanent fix was to normalize model output at the compiler boundary, reject
textual inserts with no visible content, and migrate the rows already stored in
the wrong shape.

That bug taught me to stop treating "the request succeeded" as proof that the
workflow succeeded. I now trace the full path: model output, compiled operation,
persisted data, sync event, and rendered block.

### 7:30 to 9:25: Scope creep montage

**ON CAMERA**

At this point, the original challenge was basically complete.

This would have been an excellent time to stop.

I did not stop.

**SCREEN**

Show each feature as it is mentioned.

**VOICEOVER**

First came an Expo Android client. I moved the deterministic operation engine,
contracts, undo, and queue into a shared core package. The web and mobile UIs are
different, but they emit the same operations.

Then I added inline databases. Their schemas and row values live in JSONB, while
the rows are still blocks. Table and Kanban are two views of the same children,
not separate copies of the data.

Then came an Electron spike. The renderer stays sandboxed, navigation is
allowlisted, and the desktop layout gained persistent page tabs plus a fixed AI
tab.

Then I exposed Reason through MCP so other agents could read, search, and edit
notes. MCP writes still use the canonical operation engine, with hashed tokens,
expiry, workspace grants, and separate scopes.

And finally, because apparently a Notion clone was not enough, I built a GitHub
App integration. A page or database row can link to a pull request and open a
responsive review workspace with real files and unified or split diffs.

**ON CAMERA**

Some of this was deliberate exploration. Some of it was curiosity winning an
argument against project management.

The positive side of scope creep is that it stress-tested the architecture. If
"everything is a block" and "every write is an operation" were real principles,
they had to survive mobile, AI, databases, and external agents.

The negative side is that every feature carries a tax: more contracts, more
permissions, more failure modes, more tests, and more documentation.

I learned that scope is not just a list of screens. It is the number of
invariants you are promising to preserve.

### 9:25 to 10:10: Building this with coding agents

**SCREEN**

Show a restrained montage of T3/Codex sessions, pull request reviews, the
repository's `AGENTS.md`, and focused test output. Do not linger on chat text.

**VOICEOVER**

I should also be direct about how I built this so quickly: I used coding agents
heavily.

They were a force multiplier, especially for parallel implementation and test
coverage. They were not a substitute for architecture or review. An agent can
produce a lot of code very quickly, including a lot of code that violates the
same invariant in five different places.

I kept the block protocol, service boundaries, authorization rules, and delivery
checks written in the repository. Changes went through branches, pull requests,
tests, and browser validation. When an agent failed, I turned the failure into a
regression test or a stronger rule.

That became another lesson from this project: using AI well is not accepting
code faster. It is making the constraints explicit enough that bad changes are
easy to detect and good changes have evidence.

### 10:10 to 12:05: The bugs taught me more than the features

**SCREEN**

Show a fast Git montage of fixes and tests. Use commit messages or diffs for:

- paginated operation-gap recovery
- request-log secret redaction
- drag-and-drop reliability
- cross-block text selection
- AI page normalization
- Electron navigation tests

**VOICEOVER**

The finished features look clean in a demo. The Git history is less polite.

I had sync gaps that only appeared across paginated recovery. Drag-and-drop bugs
where the tree looked correct until reload. Cross-block text selection fighting
the editor's drag handles. AI tool loops that looked like generic request
failures. Tabs that lost their title when a page lived inside a database.

One security bug was hiding inside observability. Some authenticated routes had
tokens in their URLs, and the HTTP tracing layer logged the raw URI. The fix was
to log matched route templates instead, then add a regression check for the
dangerous paths.

That changed how I think about logs. A log line is also a data export. Useful
debugging output can become a credential leak if you do not model it as part of
the security boundary.

The test strategy grew with the failures. Pure operation semantics have fast
unit tests in TypeScript and Rust. Repository tests cover authorization,
transactions, workspace isolation, and idempotency. Cypress covers full browser
flows such as reconnection, sharing, AI approval, and tab restoration.

Tests did not replace understanding. They forced me to make the behavior precise
enough that I could explain what should happen before I clicked the button.

### 12:05 to 13:10: What I would change

**SCREEN**

Show the architecture diagram from the README, then the relevant "decisions and
limits" section in `docs/arquitetura.md`.

**VOICEOVER**

Reason is deployed, but it is not secretly ready for ten million users.

The WebSocket hub is in memory, so multiple API replicas would need pub-sub.
Last-writer-wins is simple and testable, but concurrent edits to the same
property can overwrite each other. The mobile client is online-first and does
not yet queue offline writes. The Electron app is an experiment, not a released
desktop client.

There are no page-level permissions, GitHub Issues sync, inline review
submission, or webhooks yet. Operational observability still needs more work.

If I restarted today, I would protect the core protocol exactly as it is, but I
would freeze product scope earlier and build better production telemetry before
adding another client.

Being honest about those limits matters. Architecture is not a diagram of an
imaginary future. It is a record of what the current system guarantees, where it
breaks, and what the next bottleneck will be.

### 13:10 to 14:15: What this did to impostor syndrome

**ON CAMERA**

So, did building this cure impostor syndrome?

Not exactly.

But it changed the argument.

Before this project, the doubt was abstract: maybe I only knew how to work
inside systems other people had already designed.

Now I have evidence. I can point to a sync protocol, the trade-offs inside it,
the bugs that violated it, the migrations that repaired persisted data, and the
tests that prove the important paths.

Getting laid off still sucks. Building a product does not magically fix that.
What it did was remind me that engineering is not memorizing every answer. It is
turning uncertainty into a model, testing that model against reality, and
changing it when reality wins.

Copying a mature product was useful because it removed the easy part: choosing
an idea. It exposed the execution risk. The closer I looked at a familiar
feature, the more invisible engineering I found underneath it.

### 14:15 to 14:55: Hiring pitch and close

**ON CAMERA**

I am currently looking for mid-level backend or full-stack engineering
opportunities, including international remote roles.

My professional background is mainly TypeScript, Python, AWS, SaaS integrations,
and automation. This project pushed me deeper into Rust, real-time systems,
collaborative state, AI product engineering, and security boundaries.

If your team is building a product where those skills are useful, I would love
to talk. My contact information, résumé, GitHub repository, and the live Reason
demo are in the description.

And if you are not hiring, tell me which part you want to see next. I can do a
deeper video on the sync engine, the AI operation flow, or all the ways the
editor broke before it started looking obvious.

Thanks for watching.

**SCREEN**

End card:

```text
Try Reason
Read the source
Get in touch
```

Keep the live product URL, repository URL, LinkedIn, and email visible long
enough to read.

## Suggested Description

I got laid off and decided to rebuild my confidence by copying one of the most
deceptively complex products I use: Notion.

Reason started as a web-only portfolio challenge. It grew into a block-based
collaborative workspace with a Rust backend, Next.js and React clients,
PostgreSQL and pgvector, real-time operation sync, AI writes with approval,
Android, an Electron experiment, MCP access, inline databases, and GitHub pull
request review.

In this video I show what works, the bugs that exposed flaws in my mental model,
the architecture trade-offs I made, and what the project taught me about
real-time systems, AI integration, permissions, and scope.

I am currently looking for mid-level backend and full-stack engineering roles,
including international remote opportunities. My background is centered on
TypeScript, Python, AWS, SaaS integrations, and automation.

Links:

- Live demo: https://reason.israeldeveloper.com.br
- Source code: https://github.com/IsraelAraujo70/notion-clone
- LinkedIn: add the profile URL
- Résumé: add the current résumé URL
- Contact: add the preferred email address

## Chapters

```text
00:00 I got laid off
00:35 The challenge and the first lie
01:35 Everything is a block
03:15 Real-time is a recovery problem
04:35 Permissions follow the data
05:35 AI without a database shortcut
07:30 The scope creep montage
09:25 Building this with coding agents
10:10 The bugs taught me more
12:05 What I would change
13:10 Impostor syndrome after shipping
14:15 I am looking for opportunities
```

## Fact-Check and B-Roll Map

This section is for production and is not spoken.

| Claim or scene | Repository evidence |
| --- | --- |
| Original web-only scope and databases explicitly excluded | `git show 4e69f65:challenge.md` |
| The challenge began on July 8 and the current snapshot reached July 22 | `git show -s --format=%ad --date=short cf41893` and `git show -s --format=%ad --date=short e3a5cfb` |
| Everything is a block; ordering and membership invariants | `docs/protocolo.md`, `packages/core/src/engine/tree.ts`, `backend/src/domain/block.rs` |
| Optimistic operations, idempotency, cursors, LWW, and reconnect recovery | `docs/protocolo.md`, `packages/core/src/engine/op-queue.ts`, `frontend/lib/sync/workspace-socket.ts` |
| Real-time browser coverage | `frontend/cypress/e2e/m3-sync.cy.ts` |
| Search, public links, trash, and permission boundaries | `README.md`, `docs/api.md`, backend application and PostgreSQL adapters |
| AI proposals require approval and use the canonical operation flow | `docs/protocolo.md`, `backend/src/application/ai/use_case.rs`, `frontend/cypress/e2e/m5-ai.cy.ts` |
| AI `rich_text` blank-page repair | `backend/migrations/0019_normalize_ai_rich_text.sql`, commit `8fd2ff5` |
| Mobile shares deterministic contracts and operation logic | `packages/core/`, `mobile/`, commit `04f75e3` |
| Inline table and Kanban databases | `packages/core/src/database.ts`, `frontend/components/database/`, commit `54680e7` |
| Electron security model and desktop limitations | `desktop/`, `docs/adr/desktop-electron.md`, commit `9862cdf` |
| MCP tokens, scopes, and canonical writes | `docs/mcp.md`, `backend/src/adapters/mcp/mod.rs`, commit `d356920` |
| GitHub App and pull request review | `backend/src/application/github.rs`, `frontend/components/code-review/`, commit `e1ec303` |
| Agent constraints and repository working rules | `AGENTS.md`, pull request history, focused test and eval commands |
| Raw request-log token leakage regression | commit `873c0a3`, `backend/src/bootstrap/router.rs` |
| Current limitations | `README.md`, `docs/arquitetura.md` |

Repository snapshot metrics, useful for an optional visual but not necessary in
the spoken script:

```text
First challenge commit: 2026-07-08
Snapshot main commit:   2026-07-22
First-parent commits:   64
Commits reachable:      101
Tracked files:          522
SQL migrations:         22
Diff since first commit: 523 files changed, 123,318 insertions, 560 deletions
```

Do not present insertion count as hand-written application code. It includes
lockfiles, generated metadata, assets, and other repository content.

## Editing Notes

- Keep the layoff section personal but short. The product and lessons should
  carry the video.
- Alternate talking head and screen every 20 to 40 seconds.
- Let the real-time reconnect and AI approval demos play at normal speed. Those
  are the strongest proof moments.
- Speed up code scrolling and Git history. Pause only on one relevant function,
  test, or commit message at a time.
- Use the out-of-scope quotes as a recurring visual joke, not as an apology.
- Keep failed states in the edit. The blank AI page and token-log story make the
  engineering credible.
- Put the hiring pitch only near the end. The rest of the video earns it.
- Record a clean product-only version of every demo so voiceover can replace a
  talking-head take without losing continuity.
