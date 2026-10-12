/**
 * Every email address the test suite sends to, in one place.
 *
 * **Rule: a test may only send mail to an address defined here.** Do not
 * write a recipient literal into a test. Ticket #21 requires every recipient
 * in test data to sit on a domain that cannot deliver to a real inbox, and
 * keeping them in one object is how that stays enforceable.
 *
 * Every address is one of Resend's documented test addresses
 * (https://resend.com/docs/dashboard/emails/send-test-emails):
 * `delivered@resend.dev` always accepts and never forwards, and the
 * `+label` suffix tags a scenario without changing routing. Using the
 * documented form means these behave predictably if a test is ever pointed
 * at the real Resend API instead of the mock sender. `bounced@resend.dev`
 * and `complained@resend.dev` are there if a test ever needs those
 * outcomes.
 *
 * Keys name the scenario, not the address, so a test reads as
 * `sendCode(TEST_EMAILS.expired)` rather than carrying a bare string.
 */
export const TEST_EMAILS = {
  // --- Seam 1: send endpoint ---
  /** A plain send with nothing else going on. */
  sendBasic: "delivered+send-basic@resend.dev",
  /** Already a User; used to check a known address looks like an unknown one. */
  knownSender: "delivered+known-sender@resend.dev",
  /** Never seen before, paired with `knownSender`. */
  strangerSender: "delivered+stranger@resend.dev",

  // --- Seam 1: verify endpoint ---
  /** Happy-path verify: right code, cookie issued. */
  verifyOk: "delivered+verify-ok@resend.dev",
  /** Unknown at verify time; asserts the User row is created on first verify. */
  freshUser: "delivered+fresh-user@resend.dev",
  /** Burns the 3-attempt budget, then checks the 4th try is refused. */
  attempts: "delivered+attempts@resend.dev",
  /** Its code is force-expired before verify. */
  expired: "delivered+expired@resend.dev",
  /** Gets a fresh code after the previous one expired. */
  reissueAfterExpiry: "delivered+reissue-expiry@resend.dev",
  /** Gets a fresh code after the attempt budget was exhausted. */
  reissueAfterExhaustion: "delivered+reissue-exhausted@resend.dev",
  /** Already a User; paired with `unknownVerify` for the wrong-code parity check. */
  knownVerify: "delivered+known-verify@resend.dev",
  /** Never seen before, paired with `knownVerify`. */
  unknownVerify: "delivered+unknown-verify@resend.dev",
  /** Drives `createAuth` with an injected spy sender, bypassing RESEND_API_KEY. */
  injectedSender: "delivered+injected@resend.dev",

  // --- Seam 1: Turnstile gate on the send endpoint (#23) ---
  /** Send whose Turnstile token passes verification; a code is issued. */
  turnstilePass: "delivered+turnstile-pass@resend.dev",
  /** Send with no Turnstile token; rejected before a code is issued. */
  turnstileNoToken: "delivered+turnstile-no-token@resend.dev",
  /** Send whose Turnstile token fails verification; rejected before a code is issued. */
  turnstileBadToken: "delivered+turnstile-bad-token@resend.dev",
  /** Send while the Turnstile secret is unset; the gate fails closed (503). */
  turnstileUnconfigured: "delivered+turnstile-unconfigured@resend.dev",

  // --- Seam 1: production-host mock-email guard (#41) ---
  /** Send from the production Host while on `mock`; refused (503) before a code. */
  prodHostGuard: "delivered+prod-host-guard@resend.dev",
  /** Same code and mode but a staging Host; the guard must not fire. */
  prodHostStagingOk: "delivered+prod-host-staging-ok@resend.dev",
  /** Send from a mixed-case spelling of the production Host; still refused (#60). */
  prodHostMixedCase: "delivered+prod-host-mixed-case@resend.dev",

  // --- Seam 1: rate limiting on the send endpoint (#24) ---
  /**
   * Four interchangeable fillers for the per-IP / header tests: send to a
   * different one each request so the per-email limiter is never what trips,
   * leaving the per-IP rule as the only cause. Storage is cleared between
   * tests, so they are safe to reuse across cases.
   */
  rlFillerA: "delivered+rl-filler-a@resend.dev",
  rlFillerB: "delivered+rl-filler-b@resend.dev",
  rlFillerC: "delivered+rl-filler-c@resend.dev",
  rlFillerD: "delivered+rl-filler-d@resend.dev",
  /** One target address, hit from many IPs, to exercise the per-email rule. */
  rlPerEmail: "delivered+rl-per-email@resend.dev",
  /** Sent to in case/space variants to prove both limiters normalise alike. */
  rlNormalise: "delivered+rl-normalise@resend.dev",
  /** Sent 6x from the e2e-exempt IP; must never trip the per-email limit. */
  rlExemptPerEmail: "delivered+rl-exempt-per-email@resend.dev",
  /** A normal send + verify while the limiter is on; must be unaffected. */
  rlHappyPath: "delivered+rl-happy-path@resend.dev",

  // --- Seam 1: sign out (#26) ---
  /** Signs in, signs out, then checks the old session cookie is dead. */
  signOut: "delivered+sign-out@resend.dev",

  // --- Seam 1: delete account (#26) ---
  /** `/delete-user` with a valid session: 200, link recorded, User still present. */
  deleteSendOk: "delivered+delete-send-ok@resend.dev",
  /** Full happy path: request a link, follow the callback, User + session gone. */
  deleteCallbackOk: "delivered+delete-callback-ok@resend.dev",
  /** Deletes, then signs up again with the same address as a brand-new User. */
  deleteThenReregister: "delivered+delete-then-reregister@resend.dev",
  /** Callback with an unknown token (valid session): 404, User still present. */
  deleteBadToken: "delivered+delete-bad-token@resend.dev",
  /** Callback with a valid token but no session cookie: 404, User still present. */
  deleteCallbackNoSession: "delivered+delete-callback-no-session@resend.dev",
  /** After a completed deletion, the old cookie is refused by `/api/me`. */
  deleteThenMe: "delivered+delete-then-me@resend.dev",
  /** Daily send cap already spent: `/delete-user` 429s, no link recorded. */
  deleteDailyCap: "delivered+delete-daily-cap@resend.dev",
  /** 4th `/delete-user` inside 60s trips Better Auth's per-IP `customRules`. */
  deleteRateLimit: "delivered+delete-rate-limit@resend.dev",
  /** Requests deletion 5x from the e2e-exempt IP; must never 429. */
  deleteRateLimitExempt: "delivered+delete-rate-limit-exempt@resend.dev",

  // --- Seam 1: /api/test/last-delete-link (mock-only test hook) ---
  /** A link is sent, then read back through the test hook. */
  lastDeleteLinkHook: "delivered+last-delete-link-hook@resend.dev",
  /** Never had anything sent to it; asserts the hook 404s rather than inventing one. */
  neverSent: "delivered+never-sent@resend.dev",

  // --- Seam 1: /api/me ---
  /** Signs in, then reads its own email back from the session endpoint. */
  meOk: "delivered+me-ok@resend.dev",

  // --- Seam 1: /api/products (#88) ---
  /** Adds a Product and reads it back in its own list. */
  productsAddOne: "delivered+products-add-one@resend.dev",
  /** Owner side of the cross-user ownership boundary check. */
  productsOwnerA: "delivered+products-owner-a@resend.dev",
  /** Other User in the ownership boundary check; must never see A's Products. */
  productsOwnerB: "delivered+products-owner-b@resend.dev",
  /** Posts an empty/whitespace-only name; expects a 400 and nothing created. */
  productsInvalidName: "delivered+products-invalid-name@resend.dev",

  // --- Seam 1: DELETE /api/products/:productId (#89) ---
  /** Adds a Product, deletes it, then finds the list empty again. */
  productsDeleteOwn: "delivered+products-delete-own@resend.dev",

  // --- Seam 1: PATCH /api/products/:productId (#112) ---
  /** Sets a description, reads it back, then clears it with an empty string. */
  productsDescribeOwner: "delivered+products-describe-owner@resend.dev",
  /** Sends an over-cap or non-string description; expects 400s and no change. */
  productsDescribeInvalid: "delivered+products-describe-invalid@resend.dev",

  // --- Seam 1: /api/products/:productId/ideas (#99) ---
  /** Adds a Product, opens it, adds an Idea, reads it back in its own list. */
  ideasAddOne: "delivered+ideas-add-one@resend.dev",
  /** Posts an empty/whitespace-only name; expects a 400 and nothing created. */
  ideasInvalidName: "delivered+ideas-invalid-name@resend.dev",

  // --- Seam 1: DELETE /api/products/:productId/ideas/:id (#100) ---
  /** Adds an Idea, deletes it, then finds the list empty again. */
  ideasDeleteOwner: "delivered+ideas-delete-owner@resend.dev",
  /** Deletes an Idea id that was never created; expects a 404. */
  ideasDeleteNonexistent: "delivered+ideas-delete-nonexistent@resend.dev",

  // --- Seam 1: PATCH /api/products/:productId/ideas/:id (#102) ---
  /** Adds an Idea, renames it, then reads the new name back in the list. */
  ideasRenameOwner: "delivered+ideas-rename-owner@resend.dev",
  /** Renames to an empty/whitespace/over-cap name; expects 400s and no change. */
  ideasRenameInvalidName: "delivered+ideas-rename-invalid-name@resend.dev",
  /** Renames an Idea id that was never created; expects a 404. */
  ideasRenameNonexistent: "delivered+ideas-rename-nonexistent@resend.dev",

  // --- Seam 1: PUT /api/products/:productId/ideas/:id/tags (#113) ---
  /** Sets an Idea's tags, replaces them, then reads them back in the list. */
  ideasTagsOwner: "delivered+ideas-tags-owner@resend.dev",
  /** Sends an unknown tag name or a malformed body; expects 400s and no change. */
  ideasTagsInvalid: "delivered+ideas-tags-invalid@resend.dev",
  /** Tags an Idea id that was never created; expects a 404. */
  ideasTagsNonexistent: "delivered+ideas-tags-nonexistent@resend.dev",

  // --- The Journey module, called directly (#156) ---
  /** The one User who owns every Product in `journeys.worker.test.ts`. Never signs in. */
  journeysModule: "delivered+journeys-module@resend.dev",

  // --- The Paths module, called directly (#166) ---
  /** Follows Dream Sequence, and must never see `pathsModuleOwner`'s Path. Never signs in. */
  pathsModuleFollower: "delivered+paths-module-follower@resend.dev",
  /** Owns a Path seeded by raw SQL in `paths.worker.test.ts`. Never signs in. */
  pathsModuleOwner: "delivered+paths-module-owner@resend.dev",

  // --- The Paths module's Drafts, called directly (#167). Never sign in. ---
  /** Makes Paths and edits their Drafts. */
  pathsModuleMaker: "delivered+paths-module-maker@resend.dev",
  /** Must never see or edit `pathsModuleMaker`'s Paths. */
  pathsModuleStranger: "delivered+paths-module-stranger@resend.dev",
  /** Makes Paths up to the cap. */
  pathsModuleCap: "delivered+paths-module-cap@resend.dev",
  /** Is deleted, taking their Paths and Drafts with them. */
  pathsModuleDeleted: "delivered+paths-module-deleted@resend.dev",
  /** Saves a version and follows it, then is deleted, taking both with them (#169). */
  pathsModuleSaverDeleted: "delivered+paths-module-saver-deleted@resend.dev",

  // --- Seam 1: the Journey routes (#137-#140), one test each ---
  /** Reads the Journey page's state before a Journey starts. */
  journeysState: "delivered+journeys-state@resend.dev",
  /** Starts a Journey, then starts it again. */
  journeysStart: "delivered+journeys-start@resend.dev",
  /** Advances with no Journey (404), then with one. */
  journeysAdvance: "delivered+journeys-advance@resend.dev",
  /** Returns with no Journey (404), then with one. */
  journeysReturn: "delivered+journeys-return@resend.dev",
  /** Reads the Product Summary with no Journey (404), then with one. */
  worksheetsRead: "delivered+worksheets-read@resend.dev",
  /** Saves the Product Summary with no Journey (404), a bad body (400), then a good one. */
  worksheetsSave: "delivered+worksheets-save@resend.dev",
  /** Checks off a Task with no Journey (404), a bad body (400), then a good one. */
  tasksCheckOff: "delivered+tasks-check-off@resend.dev",

  // --- Seam 1: the Trailblazer routes (#167), one test each ---
  /** Lists Paths, adds one, then lists it. */
  pathsRoutesList: "delivered+paths-routes-list@resend.dev",
  /** Adds Paths up to the cap, then one more (409). */
  pathsRoutesCap: "delivered+paths-routes-cap@resend.dev",
  /** Reads and edits one Path's Draft and its Milestones. */
  pathsRoutesDraft: "delivered+paths-routes-draft@resend.dev",

  // --- Seam 1f: the gates every product route crosses (#154) ---
  /** Owns the Product every product-scoped route is driven against. */
  gatesOwner: "delivered+gates-owner@resend.dev",
  /** Other User whose request against the owner's Product must 404. */
  gatesStranger: "delivered+gates-stranger@resend.dev",

  // --- e2e: the /login + /app Playwright flow (all via the mock sender) ---
  // Every address below carries the `+e2e-test@` marker (issue #39): the
  // `+<scenario>` label sits ahead of it, so e.g. "e2e-happy" tags the
  // scenario and Better Auth still sees the trailing "+e2e-test@" that
  // `generateOTP` matches on. Playwright types the fixed code "000000"
  // straight in — no `/api/test/last-otp` hook to read it back from.
  /** Happy path: email step -> code step -> lands on /app. */
  e2eHappyPath: "delivered+e2e-happy+e2e-test@resend.dev",
  /** Persistent session: sign in, navigate away and back, still signed in. */
  e2ePersistentSession: "delivered+e2e-persistent+e2e-test@resend.dev",
  /** Sign out from `/app`: lands on `/`, a later `/app` visit bounces to `/login`. */
  e2eSignOut: "delivered+e2e-sign-out+e2e-test@resend.dev",
  /** Delete account happy path: request link, follow it, `/app` then bounces to `/login`. */
  e2eDeleteAccount: "delivered+e2e-delete-account+e2e-test@resend.dev",
  /** Design-system pass (#28): advancing to the code step moves focus there. */
  e2eFocusStepChange: "delivered+e2e-focus-step-change+e2e-test@resend.dev",
  /** Design-system pass (#28): a failed verification moves focus to the error text. */
  e2eFocusOnError: "delivered+e2e-focus-on-error+e2e-test@resend.dev",
  /** Design-system pass (#28): the send-code button disables during the request. */
  e2eNoDoubleSubmit: "delivered+e2e-no-double-submit+e2e-test@resend.dev",
  /** Products v1 slice 1 (#88): sign in, add a Product, see it in the list. */
  e2eAddProduct: "delivered+e2e-add-product+e2e-test@resend.dev",
  /** Products v1 slice 2 (#89): add a Product, delete it, confirm it's gone. */
  e2eDeleteProduct: "delivered+e2e-delete-product+e2e-test@resend.dev",
  /** Products v1 (#89 follow-up): Add product button disables/relabels while in flight. */
  e2eAddProductPending: "delivered+e2e-add-product-pending+e2e-test@resend.dev",
  /** Products v1 (#89 follow-up): Delete button disables/relabels while in flight. */
  e2eDeleteProductPending:
    "delivered+e2e-delete-product-pending+e2e-test@resend.dev",
  /** Products v1 (#89 follow-up): a near-instant delete still holds the pending row for the minimum duration. */
  e2eDeleteProductMinDuration:
    "delivered+e2e-delete-product-min-duration+e2e-test@resend.dev",
  /** Products v1 slice 3 (#90): clicking Delete reveals Confirm/Cancel; Cancel backs out without deleting. */
  e2eDeleteProductReveal:
    "delivered+e2e-delete-product-reveal+e2e-test@resend.dev",
  /** Ideas v1 slice 1 (#99): sign in, add a Product, open it, add an Idea, see it in the list. */
  e2eAddIdea: "delivered+e2e-add-idea+e2e-test@resend.dev",
  /** Ideas v1 slice 2 (#100): add a Product, add an Idea, delete it, confirm it's gone. */
  e2eDeleteIdea: "delivered+e2e-delete-idea+e2e-test@resend.dev",
  /** Ideas v1 slice 2 (#100): clicking Delete reveals Confirm/Cancel; Cancel backs out without deleting. */
  e2eDeleteIdeaReveal: "delivered+e2e-delete-idea-reveal+e2e-test@resend.dev",
  /** #102: add a Product, add an Idea, rename it, see the new name. */
  e2eRenameIdea: "delivered+e2e-rename-idea+e2e-test@resend.dev",
  /** #121: signed in, a signed-out page (/privacy) shows AppNav and the in-app footer. */
  e2eSignedInInfoPage: "delivered+e2e-signed-in-info-page+e2e-test@resend.dev",
  /** #121: signed in, visiting /login goes straight to /app. */
  e2eSignedInLoginRedirect:
    "delivered+e2e-signed-in-login-redirect+e2e-test@resend.dev",
  /** #121: log out from AppNav on /terms; the page falls back to the signed-out Header. */
  e2eSignOutFromInfoPage:
    "delivered+e2e-sign-out-from-info-page+e2e-test@resend.dev",
  /** #102: clicking Edit then Cancel backs out without saving. */
  e2eRenameIdeaCancel: "delivered+e2e-rename-idea-cancel+e2e-test@resend.dev",
  /** #128: after a successful verify, "Verify and sign in" never re-enables before the redirect. */
  e2eVerifyStaysDisabled:
    "delivered+e2e-verify-stays-disabled+e2e-test@resend.dev",
  /** #128: a wrong code shows the error above the code field and clears the boxes. */
  e2eWrongCodeClears: "delivered+e2e-wrong-code-clears+e2e-test@resend.dev",
  /** #128: "Request a new code" goes back to a blank email step. */
  e2eRequestNewCode: "delivered+e2e-request-new-code+e2e-test@resend.dev",
  /** #113: add an Idea with a Tag checked, see the Tag listed with it. */
  e2eAddIdeaWithTag: "delivered+e2e-add-idea-with-tag+e2e-test@resend.dev",
  /** #113: change an Idea's Tags via edit mode, see the new Tags listed. */
  e2eEditIdeaTags: "delivered+e2e-edit-idea-tags+e2e-test@resend.dev",
  /** #113: an Idea with every Tag shows "+N" on desktop and every pill on a phone. */
  e2eIdeaTagOverflow: "delivered+e2e-idea-tag-overflow+e2e-test@resend.dev",
  /** #137: open a Product, start its Journey, see Milestone 1 current — then advance and return. */
  e2eStartJourney: "delivered+e2e-start-journey+e2e-test@resend.dev",
  /** Finish a Journey, then Return from finished: un-finished, Growth still current. */
  e2eReturnFromFinished:
    "delivered+e2e-return-from-finished+e2e-test@resend.dev",
  /** #139: fill out the Product Summary from the Journey page, see it saved. */
  e2eFillOnePager: "delivered+e2e-fill-one-pager+e2e-test@resend.dev",
  /** #112: set a Product's description, see it persist across a reload, then clear it. */
  e2eProductDescription:
    "delivered+e2e-product-description+e2e-test@resend.dev",
  /** #133: a failed Journey fetch still opens the Product home, without the Journey line. */
  e2eProductHomeJourneyDown:
    "delivered+e2e-product-home-journey-down+e2e-test@resend.dev",
  /** #102: editing/confirming one Idea row leaves the other rows' layout unchanged. */
  e2eIdeaRowsIndependent:
    "delivered+e2e-idea-rows-independent+e2e-test@resend.dev",
  /** #102: confirming one Product row leaves the other rows' layout unchanged. */
  e2eProductRowsIndependent:
    "delivered+e2e-product-rows-independent+e2e-test@resend.dev",
  /** #167: add a Path, add, reorder, edit and delete its Milestones, then reload. */
  e2eTrailblazer: "delivered+e2e-trailblazer+e2e-test@resend.dev",
  /** #119: the account Dropdown opens from its trigger and closes on Escape, returning focus. */
  e2eAccountDropdown: "delivered+e2e-account-dropdown+e2e-test@resend.dev",
  /**
   * Opt-in post-deploy smoke (`deployment-smoke.spec.ts`) — code send only,
   * against a real deployed environment. Deliberately NOT a `+e2e-test@`
   * marker address: that spec's whole point is proving `TEST_LOGIN_ENABLED`
   * is what fences the fixed code out of a deployed environment, not the
   * sender in use — so the fixed code must stay unreachable there too.
   */
  deploySmoke: "delivered+deploy-smoke@resend.dev",

  // --- Seam 2: sender unit tests ---
  /** Default recipient for the `OtpEmail` fixture in `sender.test.ts`. */
  recruit: "delivered+recruit@resend.dev",
  /** Second recipient, for the "records each send" assertion. */
  second: "delivered+second@resend.dev",
  /** Recipient for the `DeleteAccountEmail` fixture in `sender.test.ts`. */
  deleteLinkRecipient: "delivered+delete-link-recipient@resend.dev",

  // --- Seam 1: fixed E2E-test OTP code (#39) ---
  /** `+e2e-test@` marker, `TEST_LOGIN_ENABLED=true`: the fixed code `000000` verifies. */
  e2eTestFixedCode: "delivered+e2e-test@resend.dev",
  /** No `+e2e-test@` marker: gets a real random code, not the fixed one. */
  e2eTestNoMarker: "delivered+not-e2e-test@resend.dev",

  // --- Seam 1: real ResendEmailSender path, MSW-stubbed (#66) ---
  /** Send with RESEND_API_KEY set and MSW stubbing Resend's response. */
  resendPathMsw: "delivered+resend-path-msw@resend.dev",

  // --- Live (opt-in, never CI) ---
  /** Resend's sink: always accepts, never forwards. Only `sender.live.test.ts`. */
  liveSink: "delivered@resend.dev",
} as const;

export type TestEmail = (typeof TEST_EMAILS)[keyof typeof TEST_EMAILS];

/**
 * The `From:` identity the sender tests use. Resend's shared onboarding
 * sender — works without domain verification. Not a recipient; kept here so
 * no address literal lives in a test file.
 */
export const TEST_FROM = "onboarding@resend.dev";
