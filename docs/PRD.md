# Afterlife — Product Requirements Document

> Reverse-engineered from codebase on 2026-04-16.
> Sources: `HeroScreen.tsx`, `CreateMemory.tsx`, `ChatScreen.tsx`, `pages/Index.tsx`, `App.tsx`

---

## 1. Product Vision

**Afterlife** is a grief-tech app that lets users maintain a living connection with deceased loved ones. A user provides the person's name, a photo, and a voice sample. The app creates an AI persona that the user can text or call — responding in the person's voice, with emotional warmth, as if they were still present.

**Tagline:** "Relive Memories. Always."
**Description (from UI):** "Experience a conversation with those you've lost, powered by their photo and voice."

---

## 2. User Journey (as designed)

```
Landing (HeroScreen)
  └─▶ Begin
        └─▶ Create Memory wizard (3 steps)
              Step 1: Enter name
              Step 2: Upload photo
              Step 3: Record or upload voice sample
                └─▶ Start Conversation
                      └─▶ Chat screen
                            ├─▶ Send text messages → AI responds
                            ├─▶ Send voice message (mic button)
                            └─▶ Start voice call (phone button)
```

---

## 3. Features — Full Intended Spec

### 3.1 Hero / Onboarding
| # | Feature | Status |
|---|---------|--------|
| H1 | Landing screen with branding, tagline, hero image | ✅ Built |
| H2 | "Begin" CTA navigates to Create Memory | ✅ Built |
| H3 | User authentication (sign up / log in) | ❌ Missing |
| H4 | Returning user sees their memory gallery on login | ❌ Missing |

---

### 3.2 Create Memory Wizard
| # | Feature | Status |
|---|---------|--------|
| C1 | Step 1: Enter person's name | ✅ Built |
| C2 | Step 2: Upload or capture photo | ✅ Built (local blob only) |
| C3 | Step 3: Record live audio or upload audio file | ✅ Built (local blob only) |
| C4 | Progress bar across 3 steps | ✅ Built |
| C5 | Upload photo to cloud storage (S3/R2) | ❌ Missing |
| C6 | Upload voice sample to cloud storage | ❌ Missing |
| C7 | Create memory record in database | ❌ Missing |
| C8 | Validate photo contains a human face | ❌ Missing |
| C9 | Validate audio is speech (not silence/music) | ❌ Missing |
| C10 | Clone voice using voice sample (ElevenLabs or similar) | ❌ Missing |
| C11 | Show upload progress indicator | ❌ Missing |
| C12 | Error state if upload fails | ❌ Missing |
| C13 | Release blob URLs on unmount (`URL.revokeObjectURL`) | ❌ Bug — memory leak |

---

### 3.3 Chat Screen
| # | Feature | Status |
|---|---------|--------|
| CH1 | Display person's name + photo in header | ✅ Built |
| CH2 | "Online" presence indicator | ✅ Built (hardcoded) |
| CH3 | Welcome message on load | ✅ Built (hardcoded) |
| CH4 | Text input + send button | ✅ Built |
| CH5 | Enter key sends message | ✅ Built |
| CH6 | Typing indicator (animated dots) | ✅ Built (aesthetic only) |
| CH7 | Message bubbles (user right, AI left) | ✅ Built |
| CH8 | Auto-scroll to latest message | ✅ Built |
| CH9 | AI response from real LLM API | ❌ Missing — 5 hardcoded strings |
| CH10 | AI persona aware of person's name, relationship context | ❌ Missing |
| CH11 | AI responses use conversation history (context window) | ❌ Missing |
| CH12 | AI persona system prompt built from memory data | ❌ Missing |
| CH13 | Voice synthesis: AI replies spoken in cloned voice | ❌ Missing |
| CH14 | Audio playback of spoken replies | ❌ Missing |
| CH15 | Mic button: record voice message, transcribe, send | ❌ Missing — no onClick |
| CH16 | Phone button: start real-time voice call | ❌ Missing — no onClick |
| CH17 | "Online" status reflects real AI service availability | ❌ Missing |
| CH18 | Error state when AI API fails | ❌ Missing |
| CH19 | Message persistence across sessions | ❌ Missing |
| CH20 | voiceSample prop passed to ChatScreen | ❌ Bug — orphaned in Index.tsx |
| CH21 | Typing indicator tied to real async, not setTimeout | ❌ Missing |

---

### 3.4 Memory Management
| # | Feature | Status |
|---|---------|--------|
| M1 | One memory per session (in-memory useState) | ✅ Built (limited) |
| M2 | Multiple memories per user | ❌ Missing |
| M3 | Memory gallery / list screen | ❌ Missing |
| M4 | Switch between memories | ❌ Missing |
| M5 | Delete a memory | ❌ Missing |
| M6 | Edit a memory (update name/photo/voice) | ❌ Missing |
| M7 | Memories persist across page refreshes | ❌ Missing |

---

### 3.5 Infrastructure
| # | Feature | Status |
|---|---------|--------|
| I1 | React + Vite + TypeScript + Tailwind frontend | ✅ Built |
| I2 | React Query initialized | ✅ Built (unused) |
| I3 | Backend API server | ❌ Missing |
| I4 | Database (memories, messages, users) | ❌ Missing |
| I5 | Cloud file storage (photo + audio) | ❌ Missing |
| I6 | User authentication + sessions | ❌ Missing |
| I7 | AI API integration (Claude / GPT-4) | ❌ Missing |
| I8 | Voice cloning API (ElevenLabs / PlayHT) | ❌ Missing |
| I9 | Speech-to-text API (Whisper) | ❌ Missing |
| I10 | Real-time voice call (WebRTC / Twilio) | ❌ Missing |
| I11 | React Query wired to all API calls | ❌ Missing |
| I12 | Error boundaries and global error handling | ❌ Missing |

---

## 4. Bugs Found in Current Code

| # | Bug | File | Line |
|---|-----|------|------|
| B1 | `voiceSample` collected in CreateMemory but never passed to ChatScreen | `Index.tsx` | 40–44 |
| B2 | `URL.createObjectURL` called but `URL.revokeObjectURL` never called → memory leak | `CreateMemory.tsx` | 24, 50 |
| B3 | Chat responses are random from 5 strings — no AI, no context | `ChatScreen.tsx` | 41–56 |
| B4 | Typing indicator timeout is `setTimeout` not tied to real async | `ChatScreen.tsx` | 41 |
| B5 | "Online" status is hardcoded regardless of service state | `ChatScreen.tsx` | 71 |
| B6 | Phone button has no `onClick` handler | `ChatScreen.tsx` | 73 |
| B7 | Mic button in chat has no `onClick` handler | `ChatScreen.tsx` | 120 |
| B8 | No error handling if `getUserMedia` fails (only `console.error`) | `CreateMemory.tsx` | 56 |
| B9 | All state lost on page refresh (no persistence layer) | `Index.tsx` | 17 |

---

## 5. Prioritised Build Order

### Phase 1 — Foundation (required before anything else)
1. Backend API server (Node/Express or Next.js API routes)
2. Database schema: `users`, `memories`, `messages`
3. Cloud file storage integration
4. User authentication

### Phase 2 — Core Product
5. Upload photo + voice to cloud on CreateMemory completion
6. Create memory record in DB
7. Real AI chat responses (Claude API) with persona system prompt
8. Conversation history persistence

### Phase 3 — Voice
9. Voice cloning from uploaded sample (ElevenLabs)
10. TTS playback of AI replies in chat
11. Voice message input (Whisper STT)
12. Real-time voice call (WebRTC)

### Phase 4 — Product Completeness
13. Memory gallery (multiple memories per user)
14. Memory edit/delete
15. Fix all bugs (B1–B9)
16. Wire React Query to all API calls
17. Error boundaries and error states throughout

---

## 6. Open Questions

1. **AI persona depth** — Does the AI have access to written memories/stories about the person, or only name + photo + voice?
2. **Voice call architecture** — WebRTC peer-to-peer, or server-mediated (Twilio)?
3. **Data sensitivity** — How are deceased person's photo/voice stored? GDPR/deletion policy?
4. **Consent model** — Who can create a memory of a person? Any guardrails?
5. **Monetisation** — Free tier limits? Paid features?
6. **Mobile-first vs web** — Current UI is max-w-md (mobile-first). Native app planned?
