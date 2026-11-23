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

Grok and Gemini (Google's antigravity-acp) logins join the order like any
other login in the pool. They run as ACP agents (see Accounts in the guide),
which ask before every tool and don't confirm which plan the login is on. A
thread on Gemini moves on through the pool when its sign-in has ended; other
logins' sign-in errors stay where they are.

The recovery record is saved before dispatch. An uncertain turn after a crash
uses the runner's existing interrupted-turn recovery, without blindly sending
the same message twice. A handoff asks the agent to check whether the last
external operation already succeeded before repeating it.

## Lives in

`runner/src/subscription-fallback.ts`, `runner/src/runner/subscriptions.ts`,
`runner/src/runner/pools.ts`, the recovery hooks in `runner.ts` and
`store.ts`.

Grok (since Mike's release of 16 Nov 2026) and Gemini (since his of 22 Nov
2026) are ACP agents of his (`runner/src/adapters/acp/agents.ts`), and this
feature's own adapters for them are gone. The ACP adapter
(`adapters/acp/adapter.ts`) borrows `acpFailure` from
`subscription-fallback.ts` to say when a turn failed at its subscription
limit, so the thread moves on (`test/unit/subscription-grok-limit.test.ts`),
and marks Gemini's ended sign-in as `admissionFailure`.
A shared pool saved before 16 Nov names Grok by the email the old adapter
learned; `localLogin` in `runner/src/pools.ts` lets such a member stand for
the provider's only login when that login has no email.

## Taking it out

Disable the experiment. Remove the recovery hooks, `subscription-fallback.ts`
and `runner/subscriptions.ts`, and the two fork lines in the ACP adapter. The
logins themselves are Mike's and stay.
