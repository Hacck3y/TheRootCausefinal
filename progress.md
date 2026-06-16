# Project Progress: The CivicX

This document tracks the status of the features outlined in the `Features and Plans.md` file.

## Status Summary
- **Total Features**: 24
- **Not Started**: 0
- **In Progress**: 0
- **Completed**: 24

---

## 1. Authentication & Identity
- [x] **Google OAuth 2.0 Integration**
  - Limit to Google Sign-in only
  - Request email and username only
  - 2FA prompt if not enabled
- [x] **User Verification System**
  - Cloudflare Turnstile/Captcha integration
  - Phone number submission & verification with OTP (without storing raw phone numbers or OTP)
  - Hash phone number (SHA-256) and store/validate hash to prevent duplicacy
  - User privacy prompt explaining data handling
- [x] **Privacy Controls (Two Profiles)**
  - Dual profiles per account (Public and Anonymous)
  - Public Profile: Visible posts, comments, upvotes, downvotes, debate participation, score, and rank/title
  - Anonymous Profile: Allows posts, comments, upvotes, downvotes; does not affect scoring/ranking
  - Switchable profiles, but single-profile per post constraint (no mixing profiles on the same post)

## 2. Content Creation & Submissions
- [x] **Structured Submissions**
  - Submission fields: Title, Details, Media (Photos/Videos/Audio with geotags & timestamps), Submitter Questions, Debate Option (Yes/No), Category, Profile Selection (Public/Anon)
  - Categories: Bureaucratic, Executive, Infrastructure, Environmental, Policy, Other
  - Admin review workflow (Under Review, Accepted, Rejected with AI-Agentic reason)
- [x] **Problem Clubbing**
  - Admin feature to club similar submissions based on similarity, category, and geo-location
  - User dispute option to view clubbed items and contest incorrect clubbing
- [x] **Media Integrity**
  - Auto-extract and verify EXIF metadata (geo-location and timestamp) for uploaded photos, videos, and audios
  - Block media submissions lacking valid EXIF metadata
  - Document attachments restricted to text-only (no media)

## 3. Feed & Discovery
- [x] **New Submissions Feed**
  - Shows submissions from the last 24 hours
  - Infinite scroll and lazy loading
- [x] **Trending Feed**
  - Top 50 posts per hour cycle based on hourly interaction rate
  - Sort by category, constituency, and state
- [x] **Local Feed**
  - Submissions from the user's assembly constituency (derived from geotags)
  - Sorted by recent submissions first with infinite scroll and lazy loading
- [x] **National Feed**
  - India-wide posts with highest 24-hour average interaction rate (top 500)
  - Sort by category, constituency, and state

## 4. Community & Moderation
- [x] **Voting Mechanics**
  - Reddit-style upvote/downvote system
  - Mandatory comment/reason explaining vote (minimum 15 characters)
  - Separate thread per vote comment; no voting without comment, no comment without vote
- [x] **Admin Dashboard**
  - Web panel for admin roles (Report review, Post submission review, Data analysis, Help desk)
  - Tools to delete posts, block users, review posts/users, and manage reports
- [x] **Troll Filtering**
  - Abuse detection algorithm for comments in any language to filter out spam and trolls

## 5. Engagement & Feedback
- [x] **User Ranking System**
  - Visible only on Public Profile
  - Titles based on score milestones (10, 50, 100, 500, 1000, 10000, 20000, 50000, 100000, 1000000)
    - *Sewak, Karyakarta, Pracharak, Pravakta, Pradhan, Sachiv, Maha Sachiv, Adhyaksha, Mantri, Mukhya Mantri*
  - Score adjustments:
    - Post Accepted (+9)
    - Post Rejected (-5, scales to -50 at score >=500 with 1:10 ratio)
    - Upvote/Downvote (+3/-1 to author)
    - Thread Comment (+1)
    - Debate participation (+0.5)
    - Post Ban (-100)
    - Spam/Troll penalty (-50)
  - Score below -500 restricts voting, commenting, and debates
  - Auto-notifications for score reductions (excluding downvotes) with reasons
- [x] **Feedback System & FAQ**
  - In-app reporting for posts, users, comments, and debates (with screenshots/recordings)
  - Suggestion/bug reporting channels
  - Admin survey generation and user voting on surveys
  - FAQ page with screenshots, explanations, and support mail assistance dialog

## 6. Push Notifications
- [x] **Status Change Notifications**
  - Rank updates, post engagement, admin review results (blocked/unblocked)
- [x] **Geofenced Community Alerts**
  - Local, trending, or national posts in user's constituency
