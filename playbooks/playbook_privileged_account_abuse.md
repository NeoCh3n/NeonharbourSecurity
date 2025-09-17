# Playbook: Privileged Account Abuse

- Trigger: Entra ID risky sign-in, Sentinel correlation with unusual admin actions.
- Immediate: Suspend privileged session, require manager approval for restoration.
- Investigate: Review PAM session recordings, check for data exfil.
- Contain: Rotate secrets, invalidate bearer tokens, reassign tasks per SoD.
- Report: Document control references (SA-2.3, TM-G-1 4.3) in compliance ledger.
