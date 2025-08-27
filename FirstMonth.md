# 🗂️ MVP Development Backlog v2 (Month 1)  
**Product:** Agentic AI SOC Analyst  
**Goal:** Deliver a functional MVP that demonstrates transparent, automated security alert investigations, reduces investigation time, and provides measurable SOC efficiency gains.

---

## 📌 Frontend

### User Authentication & Onboarding
**Tasks:**
- Build Login/Register page (email + password).
- Implement session management (JWT).
- Create an interactive onboarding flow that highlights:
  - AI is *not a black box*.
  - Key UI areas: Investigation Timeline, Evidence Viewer, Feedback.

**Acceptance Criteria:**
- Users can register and log in.
- First-time users see an interactive walkthrough of how AI investigations work.

---

### Alert Workbench – List View
**Tasks:**
- Display a table with:
  - Alert ID, Timestamp, Source.
  - AI-Assigned Status (`False Positive`, `Suspicious`, `True Positive`, `Investigating`).
  - AI-Assigned Severity.
- Add filters for Status and Severity.

**Acceptance Criteria:**
- Users can see a list of ingested alerts with clear SOC-friendly status labels.
- Alerts can be filtered by severity or status.

---

### Alert Detail Page – "The Investigation"
**Tasks:**
- **AI Investigation Summary:** Concise explanation + recommended next steps.
- **Investigation Timeline:** Step-by-step breakdown:
  - Action, Timestamp, Question asked, Tool called (e.g., VirusTotal API), Evidence found.
- **Evidence Viewer:** Raw data snippets (log entries, API responses).
- **User Feedback:** Buttons:
  - `[✔️ Mark as Benign]`
  - `[⚠️ Mark as Malicious]`
  - `[❌ Incorrect Evidence/Reasoning]`

**Acceptance Criteria:**
- Users can open an alert and see a full investigation with reasoning.
- Users can provide more granular feedback beyond just "Accurate/Inaccurate".

---

### Threat Hunter – Conversational Interface
**Tasks:**
- Input field for natural language queries.
- AI-generated response in natural language.
- Evidence displayed with each answer.
- Confidence score displayed (`High / Medium / Low`).

**Acceptance Criteria:**
- A user can ask: *"Any malicious IP connections in the last 24 hours?"*
- The AI responds with evidence, a clear answer, and confidence level.

---

### Dashboard
**Tasks:**
- Metrics:
  - Alerts Investigated.
  - Average Investigation Time.
  - User Feedback Score.
  - False Positive Rate.
  - Auto-Closed Rate (% of alerts closed without human action).
- Charts:
  - Alerts by Severity.
  - Alerts by Status over time.

**Acceptance Criteria:**
- Dashboard shows KPIs with updated metrics after new investigations/feedback.

---

## 📌 Backend

### Authentication & Alert Management APIs
**Tasks:**
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /alerts/ingest` (JSON + CSV upload).
- `GET /alerts`
- `GET /alerts/{id}`
- `POST /alerts/{id}/feedback`

**Acceptance Criteria:**
- Users can authenticate and manage alerts.
- Alerts can be ingested from JSON or CSV.

---

### Investigation API
**Tasks:**
- `GET /alerts/{id}/investigation`
  - Returns timeline with actions, evidence, reasoning.
  - Includes `status: investigating | completed | error`.

**Acceptance Criteria:**
- Frontend can display ongoing and completed investigations.

---

### Threat Hunter API
**Tasks:**
- `POST /hunter/query`
  - Input: natural language query.
  - Output:
    ```json
    {
      "answer": "3 malicious IP connections detected",
      "evidence": [...],
      "confidence": 0.87
    }
    ```

**Acceptance Criteria:**
- Threat Hunter interface shows AI answers with evidence + confidence score.

---

### Metrics API
**Tasks:**
- `GET /metrics`  
  Returns updated values for dashboard KPIs.

**Acceptance Criteria:**
- Dashboard data updates in near real-time.

---

## 🤖 AI Module (AI Engine)

### Investigation Plan Generation
**Tasks:**
- Input: alert JSON.
- Output: JSON with steps + reasoning:
  ```json
  {
    "step": 1,
    "action": "Check IP reputation",
    "reason": "Suspicious login from unusual IP"
  }