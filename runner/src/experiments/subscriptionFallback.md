---
id: subscriptionFallback
name: Subscription fallback
title: Continue a thread across subscription logins after a usage limit
added: 2026-11-09
on: false
reminder: 1c133315
---

## What it does

A pooled thread can continue after more than one subscription hits its limit.
It tries another compatible login of the current provider, then follows the
pool's provider order. A cycle tries each account once. Known resets have a
one-minute buffer; an unknown reset waits thirty minutes. Stop cancels the
recovery and a new user message takes precedence. Pinned threads stay pinned.

The official Google Antigravity CLI can be added through `antigravityPath`
in runner.json. It confirms its own subscription before a turn; API keys and
Google's extra credit fallback are excluded, and it offers Gemini models
only. This adapter currently supports Full access without a sandbox. A thread
requiring approvals or confinement skips it, retaining its permissions. Sign
in using `agy acp --login`; Threadbear never reads the login's tokens.
Restart the runner after enabling the experiment or configuring the path.

A Grok login joins the order like any other login in the pool. It runs as
one of the ACP agents (see Accounts in the guide), which ask before every
tool and don't confirm which plan the login is on.

The recovery record is saved before dispatch. An uncertain turn after a crash
uses the runner's existing interrupted-turn recovery, without blindly sending
the same message twice. A handoff asks the agent to check whether the last
external operation already succeeded before repeating it.

## Lives in

`runner/src/subscription-*.ts`, `runner/src/adapters/subscription-acp/` (apart
from the ACP agents' `adapters/acp/`), the provider wrapper in `adapters/antigravity/`,
its row in `runner/src/providers.ts`, `runner/subscriptions.ts`,
`runner/pools.ts`, the recovery hooks in `runner.ts` and `store.ts`.
`main.ts` registers adapters only while enabled. Clients preserve provider
strings; the Mac model picker and web formatters display their names.

Since Mike's release of 16 Nov 2026 Grok is one of the ACP agents
(`runner/src/adapters/acp/agents.ts`), and this feature's own Grok adapter
is gone: only Antigravity runs through `adapters/subscription-acp/`.

## Taking it out

Disable the experiment and remove the extra logins from pools first. Remove
registration and recovery hooks, adapter files and subscription modules. Keep
provider strings readable in saved history. Clear the configured CLI paths;
removing Threadbear does not sign out or uninstall either official CLI.
