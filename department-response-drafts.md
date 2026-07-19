# Department Response Drafts — for TEST-CYBER-REAL-001
### Use these when you're logged into the mock department portal playing the department's role. Paste as-is or tweak.

---

## Response 1 — Bank (ICICI, for `fund_hold_notice` / destination account XXXX-XXXX-6634)

```
Re: Section 94/106 BNSS Notice — Case TEST-CYBER-REAL-001

This is to acknowledge receipt of the fund-hold notice dated [auto-filled send date]
regarding account XXXX-XXXX-6634.

Status: Debit freeze applied with immediate effect as per NCRP/CFCFRMS protocol.
Balance available for lien at time of freeze: Rs. 1,12,400 (partial — remainder was
withdrawn via ATM prior to freeze application, ATM ID KAT-4471, Kandivali West branch,
withdrawal timestamp 15 July 2026, 19:42 IST).

KYC on file for account holder:
- Name: Suresh Ramnath Koli
- Registered mobile: +91-89XXXXXX03 (does not match complainant's suspect contact number
  — likely a mule account holder, not the caller)
- Address on file: [address], appears to be a rented premises per field note attached
  by branch manager
- Account opened: 02 March 2026 (recently opened, high-risk indicator)
- PAN on file: flagged for cross-verification, appears potentially fabricated

Recommend requesting ATM CCTV footage for the 19:42 IST withdrawal as next step.
```

---

## Response 2 — Bank (for second destination account XXXX-XXXX-8871, layer 2)

```
Re: Section 94/106 BNSS Notice — Case TEST-CYBER-REAL-001

Debit freeze applied. Full balance of Rs. 2,00,000 secured — no withdrawal occurred
prior to freeze (faster response this time due to same-day escalation).

KYC on file for account holder:
- Name: Deepak Traders (proprietorship account)
- Registered mobile: +91-81XXXXXX55
- Account opened: 18 June 2026
- Note: This account has received inbound transfers from 4 other complaints logged
  in the last 30 days per our internal fraud-monitoring flag — recommend cross-checking
  against other open cases in your system.
```

*(This second draft is written to deliberately trigger your cross-case correlation feature — if you have another test case in your DB referencing this same account or a similar mule pattern, this is your live test of that.)*

---

## Response 3 — Telecom (Jio/Airtel, for `telecom_cdr_request` on +91-70XXXXXX19)

```
Re: Section 94 BNSS Notice — CDR & CAF Request — Case TEST-CYBER-REAL-001

CAF (Customer Application Form) on file:
- Name: Ramesh Yadav
- ID proof: Aadhaar (photo on file does not visually match the caller described/seen
  in complainant's screen recording — possible identity used without consent, or SIM
  obtained via forged documents)
- Activation date: 28 June 2026
- Activation point of sale: Roadside PoS agent, Malad West, Mumbai

CDR for 15 July 2026 (date of incident):
- Active cell tower: Malad West Cell ID 40921, consistent through the ~3 hour call
  window (14:10–17:35 IST)
- No roaming activity — device was stationary in Mumbai throughout

Recommend: request tower dump for Malad West Cell ID 40921 during this window to
identify any co-located devices, and verify PoS agent KYC-collection compliance —
SIM may have been issued fraudulently.
```

---

## Response 4 — UPI/NPCI (for `rbiverification447@fakebank`)

```
Re: Section 94 BNSS Notice — VPA/Transaction Routing — Case TEST-CYBER-REAL-001

VPA rbiverification447@fakebank maps to account XXXX-XXXX-6634 (matches Response 1
above — confirms single-account destination for the first transfer).

Transaction routing for RRN 511029884410:
- Payer PSP: Google Pay
- Payee PSP: PhonePe
- Device metadata logged at NPCI switch: Android device, IP address logged
  (available on separate request if needed for device-fingerprint tracing)

Transaction routing for RRN 511029884521:
- Payer PSP: Google Pay
- Payee PSP: PhonePe
- Same destination bank as above (account XXXX-XXXX-8871's linked VPA)

VPA rbiverification447@fakebank has been added to NPCI's fraud-monitoring watchlist
per your request.
```

---

## Usage note

Paste these in as the department's reply text through the mock portal's "respond" action for the matching request. Each is written to include a concrete next-lead (ATM CCTV, tower dump, PoS KYC check, device fingerprint) so you can watch whether your AI's next-step suggestion engine actually picks up on these leads in its next `analyze` pass — that's a good manual check of whether the deep-lane reasoning is genuinely using the response content, not just marking the checklist complete and moving on generically.
