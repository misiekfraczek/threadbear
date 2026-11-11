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

Official Grok Build and Google Antigravity CLIs can be added through
`grokPath` and `antigravityPath` in runner.json. Each confirms its own
subscription before a turn; API keys and Google's extra credit fallback are
excluded. Google offers Gemini models only. These adapters currently support
Full access without a sandbox. A thread requiring approvals or confinement
skips them, retaining its permissions. Sign in using `grok login` or
`agy acp --login`; Threadbear never reads the login's tokens. Restart the
runner after enabling the experiment or configuring binary paths.

The recovery record is saved before dispatch. An uncertain turn after a crash
uses the runner's existing interrupted-turn recovery, without blindly sending
the same message twice. A handoff asks the agent to check whether the last
external operation already succeeded before repeating it.

## Lives in

`runner/src/subscription-*.ts`, `runner/src/adapters/subscription-acp/` (apart
from the ACP agents' `adapters/acp/`), provider wrappers in `adapters/grok/`
and `adapters/antigravity/`, their rows in `runner/src/providers.ts`, `runner/subscriptions.ts`,
`runner/pools.ts`, the recovery hooks in `runner.ts` and `store.ts`.
`main.ts` registers adapters only while enabled. Clients preserve provider
strings; the Mac model picker and web formatters display their names.

## Taking it out

Disable the experiment and remove the extra logins from pools first. Remove
registration and recovery hooks, adapter files and subscription modules. Keep
provider strings readable in saved history. Clear the configured CLI paths;
removing Threadbear does not sign out or uninstall either official CLI.
