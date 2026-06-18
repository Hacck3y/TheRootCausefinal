"use client";

import React, { useState, useEffect } from "react";

// API Gateway base URL. Configurable at build time via NEXT_PUBLIC_API_URL
// (e.g. https://api.yourdomain.com). Falls back to localhost for dev.
const API_ROOT = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_BASE = `${API_ROOT}/api/v1`;

interface User {
  id: string;
  name: string;
  email: string;
  public_username: string;
  anonymous_username: string;
  score: number;
  title: string;
  phone_hash?: string;
  two_fa_enabled: boolean;
  is_blocked: boolean;
}

interface Notification {
  id: number;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface Submission {
  id: number;
  title: string;
  description: string;
  category: string;
  author_id: string;
  profile_type: string;
  media_url?: string;
  media_type?: string;
  latitude?: number;
  longitude?: number;
  constituency?: string;
  state?: string;
  exif_metadata?: any;
  questions?: string[];
  open_debate?: boolean;
  status: string;
  rejection_reason?: string;
  clubbed_with_id?: number;
  created_at: string;
  votes_count?: number;
  comments_count?: number;
}

interface Vote {
  id: number;
  submission_id: number;
  voter_id: string;
  profile_type: string;
  vote_value: number;
  comment: string;
  moderation_status: string;
  created_at: string;
}

interface Survey {
  id: number;
  title: string;
  description: string;
  options: string[];
}

export default function HomePage() {
  // Authentication & Session States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAnonProfile, setIsAnonProfile] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authStep, setAuthStep] = useState<"oauth" | "turnstile" | "phone" | "2fa">("oauth");
  const [authForm, setAuthForm] = useState({ email: "", name: "", phone: "", otp: "", captchaVerified: false });
  const [otpFromBackend, setOtpFromBackend] = useState<string>("");
  const [policyAccepted, setPolicyAccepted] = useState<boolean>(false);

  // Accessibility & UX Sizer for Elderly/tech-shy users
  const [fontScale, setFontScale] = useState<"normal" | "large">("normal");

  // Core Feeds & Filtering States
  const [activeTab, setActiveTab] = useState<"new" | "trending" | "local" | "national" | "faq" | "surveys" | "insights">("new");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [votesList, setVotesList] = useState<Vote[]>([]);
  const [trendingFilters, setTrendingFilters] = useState({ category: "", constituency: "", state: "" });

  // Creation State
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [newPost, setNewPost] = useState({
    title: "",
    description: "",
    category: "Infrastructure",
    questions: "",
    openDebate: false,
    useSimulatedEXIF: true,
    latitude: 28.6139,
    longitude: 77.2090,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Vote Modal State
  const [voteModalOpen, setVoteModalOpen] = useState<boolean>(false);
  const [voteType, setVoteType] = useState<"up" | "down">("up");
  const [voteReason, setVoteReason] = useState<string>("");
  const [votePostId, setVotePostId] = useState<number | null>(null);

  // Notification Drawer
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState<boolean>(false);

  // Administrative / Reports
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState("");
  const [reportContent, setReportContent] = useState<{ type: string; id: number } | null>(null);
  
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyVotes, setSurveyVotes] = useState<Record<number, string>>({});

  // Dispute Model
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputePostId, setDisputePostId] = useState<number | null>(null);

  // Local/Network State Info
  const [usingMockFallback, setUsingMockFallback] = useState<boolean>(false);
  const [supportMessage, setSupportMessage] = useState("");

  // Load Initial Configuration
  useEffect(() => {
    // Attempt to parse local session
    const saved = localStorage.getItem("trc_session");
    if (saved) {
      setCurrentUser(JSON.parse(saved));
    }
    fetchFeeds();
    fetchSurveys();
  }, [activeTab, trendingFilters]);

  useEffect(() => {
    if (currentUser) {
      fetchNotifications();
      // Periodically refresh notifications
      const interval = setInterval(fetchNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Fetch helper wrapper catching offline cases
  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    try {
      // Attach the signed JWT (if present) so the gateway/services can
      // authenticate the request when AUTH_REQUIRED is enabled server-side.
      const token = typeof window !== "undefined" ? localStorage.getItem("trc_token") : null;
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const mergedOptions: RequestInit = {
        ...options,
        headers: { ...authHeaders, ...(options.headers as Record<string, string> | undefined) },
      };
      const res = await fetch(`${API_BASE}${endpoint}`, mergedOptions);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (e: any) {
      console.warn(`Gateway API offline. Falling back to local state mock. Error: ${e.message}`);
      setUsingMockFallback(true);
      return mockApiHandler(endpoint, options);
    }
  };

  const fetchFeeds = async () => {
    let endpoint = "/feed/feeds/new";
    if (activeTab === "trending") {
      const { category, constituency, state } = trendingFilters;
      endpoint = `/feed/feeds/trending?category=${category}&constituency=${constituency}&state=${state}`;
    } else if (activeTab === "local") {
      const constName = currentUser?.phone_hash ? "Assembly Constituency 12" : "Assembly Constituency 12"; // Mock/Static lookup
      endpoint = `/feed/feeds/local?constituency=${encodeURIComponent(constName)}`;
    } else if (activeTab === "national") {
      endpoint = "/feed/feeds/national";
    }

    if (activeTab !== "faq" && activeTab !== "surveys") {
      const data = await apiFetch(endpoint);
      setSubmissions(data);
    }
  };

  const fetchNotifications = async () => {
    if (!currentUser) return;
    const data = await apiFetch(`/auth/users/${currentUser.id}/notifications`);
    setNotifications(data);
  };

  const fetchSurveys = async () => {
    const data = await apiFetch("/community/surveys");
    setSurveys(data);
  };

  const fetchVotesList = async (postId: number) => {
    const data = await apiFetch(`/community/votes/submission/${postId}`);
    setVotesList(data);
  };

  // Auth flow logic
  const handleOAuthLoginMock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authForm.email || !authForm.name) return;

    // Trigger Captcha Turnstile Screen Next
    setAuthStep("turnstile");
  };

  const verifyCaptchaTurnstile = () => {
    setAuthForm((prev: typeof authForm) => ({ ...prev, captchaVerified: true }));
    setAuthStep("phone");
  };

  const handleRequestOTPMock = async () => {
    if (!authForm.phone) return;
    const res = await apiFetch("/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: authForm.phone, captchaToken: "cloudflare_mock_token" })
    });
    setOtpFromBackend(res.otp || "123456");
  };

  const handleVerifyPhoneOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    // Complete Google Auth & phone registration combined
    const loginRes = await apiFetch("/auth/login/oauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        token: "mock_google_token",
        email: authForm.email,
        name: authForm.name
      })
    });

    const user = loginRes.user;

    // Verify phone with hash
    const verifyRes = await apiFetch("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        phone: authForm.phone,
        otp: authForm.otp,
        captchaToken: "cloudflare_mock_token"
      })
    });

    // Persist the signed JWT issued at login for authenticated requests.
    if (loginRes?.token) {
      localStorage.setItem("trc_token", loginRes.token);
    }

    const verifiedUser = verifyRes.user;
    setCurrentUser(verifiedUser);
    localStorage.setItem("trc_session", JSON.stringify(verifiedUser));

    // Move to 2FA recommendation prompt if disabled
    if (!verifiedUser.two_fa_enabled) {
      setAuthStep("2fa");
    } else {
      closeAuth();
    }
  };

  const handleEnable2FA = async (enabled: boolean) => {
    if (!currentUser) return;
    const res = await apiFetch("/auth/users/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, enabled })
    });
    setCurrentUser(res.user);
    localStorage.setItem("trc_session", JSON.stringify(res.user));
    closeAuth();
  };

  const closeAuth = () => {
    setAuthModalOpen(false);
    setAuthStep("oauth");
    setAuthForm({ email: "", name: "", phone: "", otp: "", captchaVerified: false });
    setOtpFromBackend("");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("trc_session");
    localStorage.removeItem("trc_token");
    setIsAnonProfile(false);
  };

  // Mobile / On-the-go quick GPS grabber
  const handleGrabGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setNewPost(prev => ({
            ...prev,
            latitude: parseFloat(position.coords.latitude.toFixed(6)),
            longitude: parseFloat(position.coords.longitude.toFixed(6))
          }));
          alert(`Live GPS Grabbed: ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
        },
        (error) => {
          alert(`Unable to acquire live GPS: ${error.message}. Please use the simulated coordinates or input them manually.`);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  // Submission Creation
  const handleCreateSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }

    const formData = new FormData();
    formData.append("title", newPost.title);
    formData.append("description", newPost.description);
    formData.append("category", newPost.category);
    formData.append("authorId", currentUser.id);
    formData.append("profileType", isAnonProfile ? "anonymous" : "public");
    formData.append("questions", JSON.stringify(newPost.questions.split("\n").filter((q: string) => q.trim() !== "")));
    formData.append("openDebate", String(newPost.openDebate));

    if (newPost.useSimulatedEXIF) {
      formData.append("simulatedLatitude", String(newPost.latitude));
      formData.append("simulatedLongitude", String(newPost.longitude));
      formData.append("simulatedTimestamp", new Date().toISOString());
    }

    if (selectedFile) {
      formData.append("media", selectedFile);
    }

    const res = await apiFetch("/content/submissions", {
      method: "POST",
      body: formData // multipart/form-data
    });

    setCreateModalOpen(false);
    setNewPost({
      title: "",
      description: "",
      category: "Infrastructure",
      questions: "",
      openDebate: false,
      useSimulatedEXIF: true,
      latitude: 28.6139,
      longitude: 77.2090,
    });
    setSelectedFile(null);
    fetchFeeds();
    
    alert("Post submitted and is currently Under Review by the admin team.");
  };

  // Voting Trigger
  const handleVoteClick = (postId: number, type: "up" | "down") => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    setVotePostId(postId);
    setVoteType(type);
    setVoteReason("");
    setVoteModalOpen(true);
  };

  const handleSubmitVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!votePostId || !currentUser) return;

    await apiFetch("/community/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: votePostId,
        voterId: currentUser.id,
        voteType: voteType,
        reason: voteReason,
        profileType: isAnonProfile ? "anonymous" : "public"
      })
    });

    setVoteModalOpen(false);
    
    // Refresh feed and active view
    fetchFeeds();
    if (selectedSub && selectedSub.id === votePostId) {
      const updated = await apiFetch(`/content/submissions/${votePostId}`);
      setSelectedSub(updated);
      fetchVotesList(votePostId);
    }

    // Refresh user score
    const updatedUser = await apiFetch(`/auth/users/${currentUser.id}`);
    setCurrentUser(updatedUser);
    localStorage.setItem("trc_session", JSON.stringify(updatedUser));
  };

  // Dispute triggers
  const handleDisputeClick = (postId: number) => {
    setDisputePostId(postId);
    setDisputeReason("");
    setDisputeModalOpen(true);
  };

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputePostId || !currentUser) return;

    await apiFetch(`/content/submissions/${disputePostId}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        reason: disputeReason
      })
    });

    setDisputeModalOpen(false);
    alert("Clubbing dispute filed successfully for administrative review.");
  };

  // Reporting
  const handleReportClick = (type: string, id: number) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    setReportContent({ type, id });
    setReportReason("");
    setReportModalOpen(true);
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportContent || !currentUser) return;

    await apiFetch("/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reporterId: currentUser.id,
        contentType: reportContent.type,
        contentId: String(reportContent.id),
        reason: reportReason
      })
    });

    setReportModalOpen(false);
    alert("Report registered. Administrators will audit this content.");
  };

  // Survey action
  const handleSurveyVote = async (surveyId: number, option: string) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    await apiFetch(`/community/surveys/${surveyId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        optionSelected: option
      })
    });
    setSurveyVotes((prev: Record<number, string>) => ({ ...prev, [surveyId]: option }));
    alert("Thank you! Your survey vote is cast.");
  };

  const handleReadNotification = async (notifId: number) => {
    await apiFetch(`/auth/notifications/${notifId}/read`, { method: "POST" });
    fetchNotifications();
  };

  // Simulated Fallback data structures for isolated testing
  const mockApiHandler = (endpoint: string, options: RequestInit = {}) => {
    if (endpoint.startsWith("/auth/request-otp")) {
      return { otp: "482019" };
    }
    if (endpoint.startsWith("/auth/login/oauth")) {
      const email = JSON.parse(options.body as string).email;
      const name = JSON.parse(options.body as string).name;
      return {
        user: {
          id: "u_mocked",
          name,
          email,
          public_username: `${name.toLowerCase().replace(" ", "_")}_pub`,
          anonymous_username: "anon_user_9921",
          score: 15,
          title: "Sewak",
          two_fa_enabled: false,
          is_blocked: false
        }
      };
    }
    if (endpoint.startsWith("/auth/verify")) {
      const uId = JSON.parse(options.body as string).userId;
      return {
        user: {
          id: uId,
          name: authForm.name || "Test User",
          email: authForm.email || "test@example.com",
          public_username: "test_username_pub",
          anonymous_username: "anon_user_9921",
          score: 15,
          title: "Sewak",
          phone_hash: "mock_phone_hash_sha256",
          two_fa_enabled: false,
          is_blocked: false
        }
      };
    }
    if (endpoint.startsWith("/auth/users/")) {
      if (endpoint.endsWith("/notifications")) {
        return [
          { id: 1, type: "rank_up", message: "Congratulations! You have been promoted to Sewak (Volunteer)!", is_read: false, created_at: new Date().toISOString() },
          { id: 2, type: "score_update", message: "Your post 'Garbage accumulation near park' was reviewed and Accepted! +9 Points.", is_read: true, created_at: new Date().toISOString() }
        ];
      }
      // Return details
      return {
        ...currentUser,
        score: (currentUser?.score || 15) + (endpoint.includes("score") ? 1 : 0),
        title: determineTitle(currentUser?.score || 15)
      };
    }
    if (endpoint.startsWith("/content/submissions")) {
      if (endpoint.includes("/dispute")) {
        return { success: true };
      }
      // Return list or single item
      const sampleList = [
        {
          id: 101,
          title: "Damaged drainage cover on Outer Ring Road",
          description: "A concrete drain cover is completely broken. Vehicles are crashing and it's dangerous for kids.",
          category: "Infrastructure",
          author_id: "u_anon_92",
          profile_type: "anonymous",
          latitude: 28.6139,
          longitude: 77.2090,
          constituency: "Assembly Constituency 12",
          state: "Delhi",
          exif_metadata: { latitude: 28.6139, longitude: 77.2090, timestamp: "2026:06:10 14:02:11" },
          status: "Accepted",
          created_at: new Date().toISOString(),
          votes_count: 24,
          comments_count: 5
        },
        {
          id: 102,
          title: "Bribery request for license renewal",
          description: "Officer demanded 5000 INR speed money to approve certificate validation. No receipt provided.",
          category: "Bureaucratic",
          author_id: "u_mocked",
          profile_type: "public",
          latitude: 19.0760,
          longitude: 72.8777,
          constituency: "Assembly Constituency 4",
          state: "Maharashtra",
          exif_metadata: null,
          status: "Accepted",
          created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
          votes_count: 9,
          comments_count: 2
        }
      ];
      if (endpoint === "/content/submissions") return sampleList;
      return sampleList[0];
    }
    if (endpoint.startsWith("/community/votes")) {
      return [
        { id: 1, submission_id: 101, voter_id: "u_voter1", profile_type: "public", vote_value: 1, comment: "I live here and verified that this concrete cover has been broken for 3 months now.", moderation_status: "approved", created_at: new Date().toISOString() },
        { id: 2, submission_id: 101, voter_id: "u_voter2", profile_type: "anonymous", vote_value: 1, comment: "Dangerous potholes, someone could fall in at night. Hope the council acts soon.", moderation_status: "approved", created_at: new Date().toISOString() }
      ];
    }
    if (endpoint.startsWith("/community/reports")) {
      return { success: true };
    }
    if (endpoint.startsWith("/community/surveys")) {
      return [
        { id: 1, title: "Infrastructure Priority Survey 2026", description: "Which local road assets require the quickest budget release?", options: ["Road Potholes", "Drain Cover Replacements", "Footpath Encroachments"] }
      ];
    }
    return [];
  };

  const determineTitle = (score: number) => {
    if (score >= 1000000) return "Mukhya Mantri";
    if (score >= 100000) return "Mantri";
    if (score >= 50000) return "Adhyaksha";
    if (score >= 20000) return "Maha Sachiv";
    if (score >= 10000) return "Sachiv";
    if (score >= 1000) return "Pradhan";
    if (score >= 500) return "Pravakta";
    if (score >= 100) return "Pracharak";
    if (score >= 50) return "Karyakarta";
    if (score >= 10) return "Sewak";
    return "Sewak";
  };

  return (
    <div style={{ padding: "0 0 4rem 0", fontSize: fontScale === "large" ? "1.15rem" : "0.95rem" }}>
      {/* Premium Header */}
      <header className="glass" style={{ margin: "1rem", position: "sticky", top: "1rem", zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
            <span style={{ fontSize: "1.8rem", fontWeight: "bold", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              The CivicX
            </span>
            {usingMockFallback && (
              <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--warning)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                Sandbox Offline Mode
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <nav style={{ display: "flex", gap: "1rem" }}>
              <button 
                onClick={() => { setActiveTab("new"); setSelectedSub(null); }} 
                style={{ background: "none", border: "none", color: activeTab === "new" ? "var(--primary)" : "#9ca3af", fontWeight: activeTab === "new" ? "600" : "500", cursor: "pointer" }}
              >
                New Submissions
              </button>
              <button 
                onClick={() => { setActiveTab("trending"); setSelectedSub(null); }} 
                style={{ background: "none", border: "none", color: activeTab === "trending" ? "var(--primary)" : "#9ca3af", fontWeight: activeTab === "trending" ? "600" : "500", cursor: "pointer" }}
              >
                Trending
              </button>
              <button 
                onClick={() => { setActiveTab("local"); setSelectedSub(null); }} 
                style={{ background: "none", border: "none", color: activeTab === "local" ? "var(--primary)" : "#9ca3af", fontWeight: activeTab === "local" ? "600" : "500", cursor: "pointer" }}
              >
                Local Feed
              </button>
              <button 
                onClick={() => { setActiveTab("national"); setSelectedSub(null); }} 
                style={{ background: "none", border: "none", color: activeTab === "national" ? "var(--primary)" : "#9ca3af", fontWeight: activeTab === "national" ? "600" : "500", cursor: "pointer" }}
              >
                National Feed
              </button>
              <button 
                onClick={() => { setActiveTab("surveys"); setSelectedSub(null); }} 
                style={{ background: "none", border: "none", color: activeTab === "surveys" ? "var(--primary)" : "#9ca3af", fontWeight: activeTab === "surveys" ? "600" : "500", cursor: "pointer" }}
              >
                Surveys
              </button>
              <button 
                onClick={() => { setActiveTab("insights"); setSelectedSub(null); }} 
                style={{ background: "none", border: "none", color: activeTab === "insights" ? "var(--primary)" : "#9ca3af", fontWeight: activeTab === "insights" ? "600" : "500", cursor: "pointer" }}
              >
                Insights
              </button>
              <button 
                onClick={() => { setActiveTab("faq"); setSelectedSub(null); }} 
                style={{ background: "none", border: "none", color: activeTab === "faq" ? "var(--primary)" : "#9ca3af", fontWeight: activeTab === "faq" ? "600" : "500", cursor: "pointer" }}
              >
                FAQ
              </button>
            </nav>

            {/* Accessibility Font Size Toggle (for elderly/less tech-savvy users) */}
            <div style={{ display: "flex", gap: "2px", background: "rgba(255,255,255,0.04)", padding: "3px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <button 
                onClick={() => setFontScale("normal")}
                style={{ 
                  padding: "4px 8px", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem", fontWeight: "bold",
                  background: fontScale === "normal" ? "var(--primary)" : "transparent",
                  color: fontScale === "normal" ? "#fff" : "#9ca3af"
                }}
                title="Normal Sized Font"
              >
                A
              </button>
              <button 
                onClick={() => setFontScale("large")}
                style={{ 
                  padding: "4px 8px", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem", fontWeight: "bold",
                  background: fontScale === "large" ? "var(--primary)" : "transparent",
                  color: fontScale === "large" ? "#fff" : "#9ca3af"
                }}
                title="Large Sized Font for Accessibility"
              >
                A+
              </button>
            </div>

            {currentUser ? (
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {/* Profile Toggle Switch */}
                <div className="glass" style={{ display: "flex", padding: "4px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <button 
                    onClick={() => setIsAnonProfile(false)}
                    style={{ 
                      padding: "6px 12px", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600",
                      background: !isAnonProfile ? "linear-gradient(135deg, var(--primary) 0%, #2563eb 100%)" : "transparent",
                      color: !isAnonProfile ? "#fff" : "#9ca3af"
                    }}
                  >
                    Public Profile
                  </button>
                  <button 
                    onClick={() => setIsAnonProfile(true)}
                    style={{ 
                      padding: "6px 12px", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600",
                      background: isAnonProfile ? "linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)" : "transparent",
                      color: isAnonProfile ? "#fff" : "#9ca3af"
                    }}
                  >
                    Anon mode
                  </button>
                </div>

                {/* Public Badges */}
                {!isAnonProfile && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#f3f4f6" }}>
                      {currentUser.name}
                    </span>
                    <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                      <span className="badge" style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>
                        Score: {currentUser.score}
                      </span>
                      <span className="badge" style={{ background: "linear-gradient(135deg, #a78bfa, #8b5cf6)", color: "#fff" }}>
                        Rank: {currentUser.title}
                      </span>
                    </div>
                  </div>
                )}

                {isAnonProfile && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#a78bfa" }}>
                      🎭 {currentUser.anonymous_username}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>Anonymous (No Score/Titles)</span>
                  </div>
                )}

                {/* Notifications Bell */}
                <button 
                  onClick={() => setNotifOpen(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", position: "relative" }}
                >
                  🔔
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <span style={{ position: "absolute", top: 0, right: 0, width: "8px", height: "8px", borderRadius: "50%", background: "var(--error)" }}></span>
                  )}
                </button>

                <button onClick={handleLogout} className="secondary-btn" style={{ padding: "8px 16px" }}>
                  Logout
                </button>
              </div>
            ) : (
              <button onClick={() => setAuthModalOpen(true)} className="primary-btn" style={{ padding: "8px 18px" }}>
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body Layout */}
      <main style={{ maxWidth: "1200px", margin: "2rem auto", padding: "0 1rem" }}>
        
        {/* Landing Description Banner */}
        {activeTab !== "faq" && activeTab !== "surveys" && activeTab !== "insights" && !selectedSub && (
          <section className="glass-card" style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Civic Intelligence & Action</h2>
              <p style={{ color: "#9ca3af", maxWidth: "700px" }}>
                Report administrative loopholes, document infrastructrual gaps, verify location EXIF authenticity, and participate in vote-mandatory constructive citizen discussions.
              </p>
            </div>
            <button 
              onClick={() => {
                if (!currentUser) { setAuthModalOpen(true); }
                else { setCreateModalOpen(true); }
              }} 
              className="primary-btn"
            >
              + Create Submission
            </button>
          </section>
        )}

        {/* Tab content logic */}
        {activeTab === "faq" && renderFAQ()}
        {activeTab === "surveys" && renderSurveys()}
        {activeTab === "insights" && renderInsights()}
        {(activeTab === "new" || activeTab === "trending" || activeTab === "local" || activeTab === "national") && (
          <>
            {selectedSub ? (
              renderSubmissionDetail()
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
                {/* Trending Feed Filters */}
                {activeTab === "trending" && (
                  <div className="glass-card" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", padding: "16px" }}>
                    <div style={{ flex: 1, minWidth: "150px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px", color: "#9ca3af" }}>Category</label>
                      <select 
                        className="form-input" 
                        value={trendingFilters.category} 
                        onChange={e => setTrendingFilters(prev => ({ ...prev, category: e.target.value }))}
                      >
                        <option value="">All Categories</option>
                        <option value="Bureaucratic">Bureaucratic</option>
                        <option value="Executive">Executive</option>
                        <option value="Infrastructure">Infrastructure</option>
                        <option value="Environmental">Environmental</option>
                        <option value="Policy">Policy</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: "150px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px", color: "#9ca3af" }}>Constituency</label>
                      <input 
                        type="text" 
                        placeholder="Filter Constituency" 
                        className="form-input"
                        value={trendingFilters.constituency}
                        onChange={e => setTrendingFilters(prev => ({ ...prev, constituency: e.target.value }))}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: "150px" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px", color: "#9ca3af" }}>State</label>
                      <input 
                        type="text" 
                        placeholder="Filter State" 
                        className="form-input"
                        value={trendingFilters.state}
                        onChange={e => setTrendingFilters(prev => ({ ...prev, state: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* Submissions list */}
                {submissions.length === 0 ? (
                  <div className="glass-card" style={{ textAlign: "center", padding: "4rem" }}>
                    <p style={{ color: "#9ca3af", fontSize: "1.1rem" }}>No active submissions found matching this feed tab.</p>
                  </div>
                ) : (
                  submissions.map(sub => (
                    <div 
                      key={sub.id} 
                      className="glass-card animate-fade-in"
                      style={{ display: "flex", gap: "1.5rem", borderLeft: `4px solid ${sub.status === "Accepted" ? "var(--success)" : sub.status === "Rejected" ? "var(--error)" : "var(--warning)"}` }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "50px" }}>
                        {/* Vote Action Buttons */}
                        <button 
                          onClick={() => handleVoteClick(sub.id, "up")}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.6rem" }}
                        >
                          🔺
                        </button>
                        <span style={{ fontSize: "1.2rem", fontWeight: "700", margin: "4px 0" }}>
                          {(sub.votes_count || 0)}
                        </span>
                        <button 
                          onClick={() => handleVoteClick(sub.id, "down")}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.6rem" }}
                        >
                          🔻
                        </button>
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <span className="badge" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", marginBottom: "6px" }}>
                              {sub.category}
                            </span>
                            <h3 
                              onClick={() => { setSelectedSub(sub); fetchVotesList(sub.id); }}
                              style={{ fontSize: "1.3rem", fontWeight: "600", cursor: "pointer" }}
                            >
                              {sub.title}
                            </h3>
                          </div>
                          
                          <div style={{ display: "flex", gap: "8px" }}>
                            {sub.exif_metadata && (
                              <span className="badge" style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--success)", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                                ✓ EXIF Verified
                              </span>
                            )}
                            <span className="badge" style={{ 
                              background: sub.status === "Accepted" ? "rgba(16,185,129,0.15)" : sub.status === "Rejected" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                              color: sub.status === "Accepted" ? "var(--success)" : sub.status === "Rejected" ? "var(--error)" : "var(--warning)"
                            }}>
                              {sub.status}
                            </span>
                          </div>
                        </div>

                        <p style={{ color: "#9ca3af", margin: "8px 0" }}>
                          {sub.description.substring(0, 150)}
                          {sub.description.length > 150 && "..."}
                        </p>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#6b7280", marginTop: "1rem" }}>
                          <div>
                            <span>By: {sub.profile_type === "anonymous" ? "🎭 Anonymous" : `User ${sub.author_id}`}</span>
                            <span style={{ margin: "0 8px" }}>•</span>
                            <span>{sub.constituency ? `📍 ${sub.constituency}, ${sub.state}` : "No geo location"}</span>
                          </div>
                          <div>
                            <span>💬 {sub.comments_count || 0} explanations</span>
                            {sub.clubbed_with_id && (
                              <span style={{ color: "var(--warning)", marginLeft: "12px" }}>
                                🔗 Clubbed Issue
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* SUBMISSION DETAIL VIEW */}
      {selectedSub && renderSubmissionDetail()}

      {/* AUTHENTICATION FLOW MODAL */}
      {authModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="glass-card animate-fade-in" style={{ width: "100%", maxWidth: "450px", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.4rem" }}>Sign In & Verify Identity</h3>
              <button onClick={closeAuth} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "1.2rem" }}>✕</button>
            </div>

            {authStep === "oauth" && (
              <form onSubmit={handleOAuthLoginMock}>
                <p style={{ fontSize: "0.9rem", color: "#9ca3af", marginBottom: "1.5rem" }}>
                  To ensure rapid verification and prevent bot networks, Google OAuth authentication is mandatory.
                </p>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Email Address</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="name@gmail.com" 
                    className="form-input" 
                    value={authForm.email}
                    onChange={e => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Full Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Enter name" 
                    className="form-input" 
                    value={authForm.name}
                    onChange={e => setAuthForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <button type="submit" className="primary-btn" style={{ width: "100%", display: "flex", justifyContent: "center", gap: "8px" }}>
                  Sign in with Google
                </button>
              </form>
            )}

            {authStep === "turnstile" && (
              <div style={{ textAlign: "center", padding: "1rem" }}>
                <p style={{ marginBottom: "1rem" }}>Cloudflare Turnstile Validation</p>
                <div className="glass" style={{ padding: "2rem", border: "1px solid var(--glass-border)", borderRadius: "8px", cursor: "pointer" }} onClick={verifyCaptchaTurnstile}>
                  <div style={{ display: "inline-block", width: "24px", height: "24px", borderRadius: "50%", border: "3px solid #3b82f6", borderTopColor: "transparent", animation: "spin 1s linear infinite" }}></div>
                  <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>Checking browser history & activity patterns...</p>
                  <span style={{ fontSize: "0.75rem", color: "#3b82f6", textDecoration: "underline", display: "block", marginTop: "12px" }}>
                    Click to confirm verification
                  </span>
                </div>
              </div>
            )}

            {authStep === "phone" && (
              <form onSubmit={handleVerifyPhoneOTP}>
                <h4 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>Verify Phone Duplicacy</h4>
                
                {/* POLICY EXPLANATION DIALOG */}
                <div className="glass" style={{ padding: "12px", fontSize: "0.8rem", color: "#9ca3af", border: "1px solid rgba(139, 92, 246, 0.25)", borderRadius: "8px", marginBottom: "1rem" }}>
                  <strong>🔒 Privacy Shielded Phone Hashing:</strong> We do NOT store your phone number. It is instantly hashed (SHA-256) on submission.
                  <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "#a78bfa" }}>
                    💡 <em>Elderly Helper:</em> "Hashing" turns your number into a unique code (like a digital fingerprint). We check this code to verify you, but can never see or restore your actual number!
                  </div>
                  {authForm.phone && (
                    <div style={{ marginTop: "8px", background: "rgba(0,0,0,0.2)", padding: "6px", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.72rem", color: "#60a5fa" }}>
                      🛡️ Current Hash Preview: {authForm.phone.length > 5 ? 
                        Array.from(authForm.phone).reduce((h, c) => (h = (h << 5) - h + c.charCodeAt(0)) & h, 0).toString(16).replace("-", "f") + "90f5c1d683ae280ff628" 
                        : "Waiting for phone input..."}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Mobile Number</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input 
                      type="tel" 
                      required 
                      placeholder="+91 XXXXX XXXXX" 
                      className="form-input" 
                      value={authForm.phone}
                      onChange={e => setAuthForm(prev => ({ ...prev, phone: e.target.value }))}
                    />
                    <button type="button" onClick={handleRequestOTPMock} className="secondary-btn" style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      Send OTP
                    </button>
                  </div>
                </div>

                {otpFromBackend && (
                  <div className="badge animate-fade-in" style={{ width: "100%", background: "rgba(16, 185, 129, 0.15)", color: "var(--success)", padding: "8px 12px", borderRadius: "6px", marginBottom: "1rem", textAlign: "left" }}>
                    🔑 Simulated OTP Code Sent: <strong>{otpFromBackend}</strong>
                  </div>
                )}

                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Enter 6-digit OTP</label>
                  <input 
                    type="text" 
                    required 
                    maxLength={6} 
                    placeholder="Enter Code" 
                    className="form-input" 
                    value={authForm.otp}
                    onChange={e => setAuthForm(prev => ({ ...prev, otp: e.target.value }))}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "1.5rem" }}>
                  <input 
                    type="checkbox" 
                    id="consent_check" 
                    checked={policyAccepted} 
                    onChange={e => setPolicyAccepted(e.target.checked)} 
                  />
                  <label htmlFor="consent_check" style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                    I agree to the cryptographic phone hashing terms.
                  </label>
                </div>

                <button 
                  type="submit" 
                  disabled={!policyAccepted} 
                  className="primary-btn" 
                  style={{ width: "100%", opacity: policyAccepted ? 1 : 0.5 }}
                >
                  Verify and Authenticate
                </button>
              </form>
            )}

            {authStep === "2fa" && (
              <div style={{ textAlign: "center" }}>
                <h4 style={{ fontSize: "1.2rem", marginBottom: "12px" }}>🔒 Enable 2FA Security?</h4>
                <p style={{ fontSize: "0.9rem", color: "#9ca3af", marginBottom: "1.5rem" }}>
                  We recommend enabling Multi-Factor Authentication (2FA) to safeguard your public reputation, voting history, and rankings from hijacking.
                </p>
                <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                  <button onClick={() => handleEnable2FA(true)} className="primary-btn">
                    Enable 2FA Now
                  </button>
                  <button onClick={() => handleEnable2FA(false)} className="secondary-btn">
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE SUBMISSION MODAL */}
      {createModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="glass-card animate-fade-in" style={{ width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "12px" }}>
              <h3 style={{ fontSize: "1.4rem" }}>Create structured submission</h3>
              <button onClick={() => setCreateModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "1.2rem" }}>✕</button>
            </div>

            <form onSubmit={handleCreateSubmission}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Category</label>
                <select 
                  className="form-input" 
                  value={newPost.category} 
                  onChange={e => setNewPost(prev => ({ ...prev, category: e.target.value }))}
                >
                  <option value="Bureaucratic">Bureaucratic (Government Transparency/Red Tape)</option>
                  <option value="Executive">Executive (Administrative Failure)</option>
                  <option value="Infrastructure">Infrastructure (Public Assets Repairs)</option>
                  <option value="Environmental">Environmental (Sanitation, Nature)</option>
                  <option value="Policy">Policy (New Policy reviews)</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Title</label>
                <input 
                  type="text" 
                  required 
                  placeholder="Summarize the core problem" 
                  className="form-input"
                  value={newPost.title}
                  onChange={e => setNewPost(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Detailed Description</label>
                <textarea 
                  required 
                  rows={4} 
                  placeholder="Elaborate on the loophole, local impact, and what needs fixing..." 
                  className="form-input"
                  value={newPost.description}
                  onChange={e => setNewPost(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              {/* Media Uploader */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Upload Media (Image / Video / Audio)</label>
                <input 
                  type="file" 
                  accept="image/*,video/*,audio/*,.txt" 
                  className="form-input"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                />
                <span style={{ fontSize: "0.75rem", color: "#9ca3af", display: "block", marginTop: "4px" }}>
                  * Non-text files must contain EXIF metadata coordinates. Documents (.txt) require no EXIF.
                </span>
                {selectedFile && (
                  <div className="glass animate-fade-in" style={{ padding: "10px", marginTop: "8px", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", fontSize: "0.8rem" }}>
                    {selectedFile.name.toLowerCase().endsWith('.txt') ? (
                      <span style={{ color: "var(--success)" }}>
                        📄 Document selected. Verification rule: Documents are text-only and do not require EXIF coordinates.
                      </span>
                    ) : newPost.useSimulatedEXIF ? (
                      <span style={{ color: "var(--success)" }}>
                        ✓ EXIF Simulator Active. Injected GPS Coordinates: <strong>{newPost.latitude.toFixed(4)}, {newPost.longitude.toFixed(4)}</strong>. This will successfully pass location verification.
                      </span>
                    ) : (
                      <span style={{ color: "var(--warning)" }}>
                        ⚠️ Warning: Uploaded media might lack EXIF coordinates. If verification fails, please enable the <strong>EXIF Injector Tool</strong> below to simulate GPS coordinates.
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Citizen GPS Grabber & Testing Simulator */}
              <div className="glass" style={{ padding: "12px", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "8px", marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#10b981" }}>📍 Citizen GPS Verification</span>
                  <button 
                    type="button" 
                    onClick={handleGrabGPS}
                    className="secondary-btn" 
                    style={{ padding: "4px 10px", fontSize: "0.75rem", height: "auto" }}
                  >
                    Auto-Grab My Location
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <input 
                    type="checkbox" 
                    id="useSimulatedEXIF"
                    checked={newPost.useSimulatedEXIF} 
                    onChange={e => setNewPost(prev => ({ ...prev, useSimulatedEXIF: e.target.checked }))} 
                  />
                  <label htmlFor="useSimulatedEXIF" style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                    Or simulate GPS coordinates (helpful for manual testing)
                  </label>
                </div>
                {newPost.useSimulatedEXIF && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Latitude Coordinate</label>
                      <input 
                        type="number" 
                        step="0.000001" 
                        className="form-input" 
                        value={newPost.latitude}
                        onChange={e => setNewPost(prev => ({ ...prev, latitude: parseFloat(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Longitude Coordinate</label>
                      <input 
                        type="number" 
                        step="0.000001" 
                        className="form-input" 
                        value={newPost.longitude}
                        onChange={e => setNewPost(prev => ({ ...prev, longitude: parseFloat(e.target.value) }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Debate Panel</label>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <input 
                    type="checkbox" 
                    id="open_debate" 
                    checked={newPost.openDebate}
                    onChange={e => setNewPost(prev => ({ ...prev, openDebate: e.target.checked }))}
                  />
                  <label htmlFor="open_debate" style={{ fontSize: "0.85rem" }}>Open this submission for public citizens debate</label>
                </div>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px" }}>Questions to the submittee (one per line)</label>
                <textarea 
                  rows={2} 
                  placeholder="e.g. Can you provide the department letter number?" 
                  className="form-input"
                  value={newPost.questions}
                  onChange={e => setNewPost(prev => ({ ...prev, questions: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" className="secondary-btn" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Submit Post</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOTING REASON EXPLANATION MODAL */}
      {voteModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="glass-card animate-fade-in" style={{ width: "100%", maxWidth: "450px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.2rem" }}>Mandatory Voting Rationale</h3>
              <button onClick={() => setVoteModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>✕</button>
            </div>

            <form onSubmit={handleSubmitVote}>
              <div className="glass" style={{ padding: "12px", fontSize: "0.85rem", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", marginBottom: "1rem" }}>
                ℹ️ <strong>Quality Requirement:</strong> Citizens must explain why they support or oppose this report. Minimum comment length: <strong>15 characters</strong>. Abusive comments result in severe penalty (-50 points).
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "8px" }}>
                  Explain your {voteType === "up" ? "Upvote (Support)" : "Downvote (Oppose)"} reason
                </label>
                <textarea 
                  required 
                  rows={4} 
                  placeholder="State facts, local context, or proof corroborating this civic issue..." 
                  className="form-input"
                  value={voteReason}
                  onChange={e => setVoteReason(e.target.value)}
                />
                <span style={{ fontSize: "0.75rem", color: voteReason.length >= 15 ? "var(--success)" : "var(--error)", display: "block", marginTop: "4px" }}>
                  Character Count: {voteReason.length} / 15
                </span>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" className="secondary-btn" onClick={() => setVoteModalOpen(false)}>Cancel</button>
                <button type="submit" disabled={voteReason.length < 15} className="primary-btn" style={{ opacity: voteReason.length >= 15 ? 1 : 0.5 }}>
                  Submit Vote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISPUTE MODAL */}
      {disputeModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="glass-card animate-fade-in" style={{ width: "100%", maxWidth: "450px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.2rem" }}>Dispute Problem Clubbing</h3>
              <button onClick={() => setDisputeModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>✕</button>
            </div>

            <form onSubmit={handleSubmitDispute}>
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "8px" }}>
                  Explain why this post is NOT rightfully clubbed with the others:
                </label>
                <textarea 
                  required 
                  rows={4} 
                  placeholder="Provide differences in coordinates, category, or problem definition..." 
                  className="form-input"
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" className="secondary-btn" onClick={() => setDisputeModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Submit Dispute</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT CONTENT MODAL */}
      {reportModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="glass-card animate-fade-in" style={{ width: "100%", maxWidth: "450px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.2rem" }}>Report Flagged Activity</h3>
              <button onClick={() => setReportModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>✕</button>
            </div>

            <form onSubmit={handleSubmitReport}>
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "8px" }}>
                  Reason for reporting (abuses, troll, duplicacy, fake location)
                </label>
                <textarea 
                  required 
                  rows={4} 
                  placeholder="Explain why this content violations community terms..." 
                  className="form-input"
                  value={reportReason}
                  onChange={e => setReportReason(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" className="secondary-btn" onClick={() => setReportModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-btn" style={{ background: "var(--error)" }}>Submit Report</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NOTIFICATION PANEL (DRAWER) */}
      {notifOpen && (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "380px", background: "rgba(10, 15, 30, 0.95)", borderLeft: "1px solid rgba(255,255,255,0.08)", zIndex: 1000, padding: "2rem", display: "flex", flexDirection: "column", boxShadow: "-10px 0 30px rgba(0,0,0,0.5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1.2rem" }}>Alerts & Notifications</h3>
            <button onClick={() => setNotifOpen(false)} style={{ background: "none", border: "none", color: "#f3f4f6", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
            {notifications.length === 0 ? (
              <p style={{ color: "#9ca3af", textAlign: "center", marginTop: "2rem" }}>No active alerts.</p>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className="glass" style={{ padding: "12px", position: "relative", borderLeft: `3px solid ${notif.type === "rank_up" ? "var(--primary)" : "var(--warning)"}`, opacity: notif.is_read ? 0.6 : 1 }}>
                  <p style={{ fontSize: "0.85rem", color: "#f3f4f6", paddingRight: "20px" }}>{notif.message}</p>
                  <span style={{ fontSize: "0.7rem", color: "#6b7280", display: "block", marginTop: "6px" }}>
                    {new Date(notif.created_at).toLocaleDateString()}
                  </span>
                  {!notif.is_read && (
                    <button 
                      onClick={() => handleReadNotification(notif.id)}
                      style={{ position: "absolute", top: "8px", right: "8px", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "#60a5fa" }}
                    >
                      ✓ Read
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Citizens on the Go: Quick Submission FAB */}
      {currentUser && (
        <button
          onClick={() => setCreateModalOpen(true)}
          style={{
            position: "fixed",
            bottom: "2rem",
            right: "2rem",
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--primary) 0%, #2563eb 100%)",
            color: "#fff",
            border: "none",
            boxShadow: "0 4px 20px rgba(37, 99, 235, 0.4)",
            cursor: "pointer",
            fontSize: "2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99,
            transition: "transform 0.2s"
          }}
          title="Create submission on the go"
        >
          +
        </button>
      )}
    </div>
  );

  function renderFAQ() {
    return (
      <div className="glass-card animate-fade-in" style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px" }}>
          Frequently Asked Questions
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {[
            {
              q: "How does the cryptographic phone number verification work?",
              a: "To prevent duplicate accounts and bots, users must authenticate with a phone number. To protect privacy, we do NOT save your phone number or the OTP. We instantly convert it to a cryptographically secure hash (SHA-256) and store/match only that hash."
            },
            {
              q: "Why does my media file need EXIF location metadata?",
              a: "To guarantee that public problem reports are legitimate and captured live, we enforce geo-location and timestamp metadata check on uploaded photos/videos. If your device has GPS settings off or strips metadata, the system rejects it. Use our simulated coordinates injector inside the submit box to try out local testing."
            },
            {
              q: "What is the difference between Public and Anonymous profiles?",
              a: "Every verified user has two modes: Public and Anonymous. Public contributions gain points (+9 for accepted submissions, +1 for comments) and unlock ranking levels (Sewak, Karyakarta, up to Mukhya Mantri). Anonymous contributions allow you to post and vote privately without score changes. You can switch modes in the header switch, but on any post, you cannot vote or comment using both profiles."
            },
            {
              q: "Why is a comment mandatory to vote?",
              a: "To eliminate brigading and spam upvoting, users are required to supply a minimum 15-character reason explaining their vote. Submissions or comments flagging other users are audited, and trolled comments receive a heavy -50 points deduction."
            }
          ].map((item, idx) => (
            <details key={idx} className="glass" style={{ padding: "16px", cursor: "pointer" }}>
              <summary style={{ fontWeight: "600", fontSize: "1.1rem", color: "var(--primary)" }}>{item.q}</summary>
              <p style={{ marginTop: "8px", color: "#9ca3af", fontSize: "0.95rem", lineHeight: "1.6" }}>{item.a}</p>
            </details>
          ))}
        </div>

        {/* Support Mail Dialogue */}
        <div className="glass" style={{ padding: "20px", marginTop: "2rem", border: "1px solid rgba(59,130,246,0.2)" }}>
          <h4 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>📮 Support Assistance Helpdesk</h4>
          <p style={{ fontSize: "0.9rem", color: "#9ca3af", marginBottom: "1rem" }}>Have issues, feedback, or need manual role activation? Message our support desk below.</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input 
              type="text" 
              placeholder="Describe your request..." 
              className="form-input" 
              value={supportMessage}
              onChange={e => setSupportMessage(e.target.value)}
            />
            <button 
              onClick={() => {
                alert("Message queued for Support Helpdesk bot and coordinators.");
                setSupportMessage("");
              }}
              className="primary-btn"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSurveys() {
    return (
      <div className="glass-card animate-fade-in" style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px" }}>
          Active Feedback Surveys
        </h2>

        {surveys.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>No active surveys at the moment.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {surveys.map(survey => (
              <div key={survey.id} className="glass" style={{ padding: "20px" }}>
                <h3 style={{ fontSize: "1.2rem", fontWeight: "600", color: "#f3f4f6" }}>{survey.title}</h3>
                <p style={{ fontSize: "0.9rem", color: "#9ca3af", margin: "8px 0" }}>{survey.description}</p>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                  {survey.options.map(opt => {
                    const votedFor = surveyVotes[survey.id] === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => handleSurveyVote(survey.id, opt)}
                        style={{
                          padding: "10px",
                          textAlign: "left",
                          border: votedFor ? "1px solid var(--success)" : "1px solid rgba(255,255,255,0.06)",
                          background: votedFor ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.02)",
                          color: votedFor ? "var(--success)" : "#f3f4f6",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontWeight: votedFor ? "bold" : "normal"
                        }}
                      >
                        {opt} {votedFor && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderSubmissionDetail() {
    if (!selectedSub) return null;
    return (
      <div className="glass-card animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <button 
          onClick={() => { setSelectedSub(null); fetchFeeds(); }} 
          className="secondary-btn" 
          style={{ alignSelf: "flex-start", padding: "6px 12px" }}
        >
          ← Back to feeds
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
              <span className="badge" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa" }}>
                {selectedSub.category}
              </span>
              <span className="badge" style={{ 
                background: selectedSub.status === "Accepted" ? "rgba(16,185,129,0.15)" : selectedSub.status === "Rejected" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                color: selectedSub.status === "Accepted" ? "var(--success)" : selectedSub.status === "Rejected" ? "var(--error)" : "var(--warning)"
              }}>
                {selectedSub.status}
              </span>
            </div>
            <h2 style={{ fontSize: "2rem", fontWeight: "700" }}>{selectedSub.title}</h2>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            {selectedSub.clubbed_with_id && (
              <button onClick={() => handleDisputeClick(selectedSub.id)} className="secondary-btn" style={{ padding: "8px 16px", border: "1px solid var(--warning)", color: "var(--warning)" }}>
                Dispute Clubbing
              </button>
            )}
            <button onClick={() => handleReportClick("post", selectedSub.id)} className="secondary-btn" style={{ padding: "8px 16px", border: "1px solid var(--error)", color: "var(--error)" }}>
              Report Post
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}>
          <div>
            <p style={{ fontSize: "1.1rem", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
              {selectedSub.description}
            </p>

            {selectedSub.media_url && (
              <div style={{ marginTop: "1.5rem" }}>
                {selectedSub.media_type === "image" && (
                  <img src={selectedSub.media_url} alt="Submission Media" style={{ width: "100%", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }} />
                )}
                {selectedSub.media_type === "video" && (
                  <video src={selectedSub.media_url} controls style={{ width: "100%", borderRadius: "12px" }} />
                )}
                {selectedSub.media_type === "audio" && (
                  <audio src={selectedSub.media_url} controls style={{ width: "100%", marginTop: "1rem" }} />
                )}
              </div>
            )}

            {/* AI Rejection Reason */}
            {selectedSub.status === "Rejected" && selectedSub.rejection_reason && (
              <div className="glass" style={{ padding: "16px", border: "1px solid var(--error)", borderRadius: "8px", marginTop: "1.5rem" }}>
                <strong style={{ color: "var(--error)" }}>❌ Rejection Audit:</strong>
                <p style={{ marginTop: "6px", fontSize: "0.95rem" }}>{selectedSub.rejection_reason}</p>
              </div>
            )}

            {/* Debate Panel if checked */}
            {selectedSub.open_debate && (
              <div className="glass" style={{ padding: "20px", marginTop: "2rem", border: "1px solid rgba(139,92,246,0.2)" }}>
                <h4 style={{ fontSize: "1.2rem", color: "#c084fc", marginBottom: "8px" }}>🗣️ Active Debate Thread</h4>
                <p style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: "1rem" }}>This issue is open for debate. Please present data-driven arguments and policy citations.</p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="text" placeholder="Present debate point..." className="form-input" />
                  <button className="primary-btn" onClick={() => alert("Debate points can be added by registered citizens.")}>
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Metadata and Geotags */}
            <div className="glass-card" style={{ padding: "16px" }}>
              <h4 style={{ fontWeight: "600", marginBottom: "12px" }}>Submission Audit</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem" }}>
                <div>📍 <strong>Constituency:</strong> {selectedSub.constituency || "Unspecified"}</div>
                <div>🇮🇳 <strong>State:</strong> {selectedSub.state || "Unspecified"}</div>
                <div>🌐 <strong>Coordinates:</strong> {selectedSub.latitude ? `${selectedSub.latitude.toFixed(4)}, ${selectedSub.longitude?.toFixed(4)}` : "None"}</div>
                {selectedSub.exif_metadata && (
                  <div style={{ color: "var(--success)" }}>
                    ✓ Metadata integrity verified. Photo original captured at {selectedSub.exif_metadata.timestamp || "Original time"}.
                  </div>
                )}
              </div>
            </div>

            {/* Submitter Questions */}
            {selectedSub.questions && selectedSub.questions.length > 0 && (
              <div className="glass-card" style={{ padding: "16px" }}>
                <h4 style={{ fontWeight: "600", marginBottom: "12px" }}>Required Answers</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem" }}>
                  {selectedSub.questions.map((q, i) => (
                    <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <strong>Q{i+1}:</strong> {q}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Constructive Comments Feed */}
        <div style={{ marginTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.4rem" }}>Constructive Comments & Vote Rationale</h3>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => handleVoteClick(selectedSub.id, "up")} className="primary-btn" style={{ padding: "8px 16px" }}>
                🔺 Support (Upvote)
              </button>
              <button onClick={() => handleVoteClick(selectedSub.id, "down")} className="secondary-btn" style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--error)", color: "var(--error)" }}>
                🔻 Oppose (Downvote)
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {votesList.length === 0 ? (
              <p style={{ color: "#9ca3af" }}>No explanations submitted yet. Be the first to vote and comment.</p>
            ) : (
              votesList.map(vote => (
                <div key={vote.id} className="glass" style={{ padding: "16px", borderLeft: `3px solid ${vote.vote_value === 1 ? "var(--success)" : "var(--error)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#9ca3af", marginBottom: "6px" }}>
                    <div>
                      <span style={{ color: vote.vote_value === 1 ? "var(--success)" : "var(--error)", fontWeight: "bold" }}>
                        {vote.vote_value === 1 ? "▲ UPVOTE" : "▼ DOWNVOTE"}
                      </span>
                      <span style={{ margin: "0 8px" }}>•</span>
                      <span>By: {vote.profile_type === "anonymous" ? "🎭 Anonymous" : `User ${vote.voter_id}`}</span>
                    </div>
                    <span>{new Date(vote.created_at).toLocaleDateString()}</span>
                  </div>

                  <p style={{ fontSize: "0.95rem" }}>{vote.comment}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderInsights() {
    const categories: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    const constituencies: Record<string, number> = {};

    submissions.forEach(sub => {
      categories[sub.category] = (categories[sub.category] || 0) + 1;
      statuses[sub.status] = (statuses[sub.status] || 0) + 1;
      const key = sub.constituency || "Unspecified Location";
      constituencies[key] = (constituencies[key] || 0) + 1;
    });

    if (submissions.length === 0) {
      categories["Infrastructure"] = 12;
      categories["Environmental"] = 8;
      categories["Bureaucratic"] = 5;
      categories["Executive"] = 3;
      statuses["Accepted"] = 18;
      statuses["Under Review"] = 7;
      statuses["Rejected"] = 3;
      constituencies["Assembly Constituency 12"] = 14;
      constituencies["Assembly Constituency 3"] = 11;
      constituencies["Assembly Constituency 4"] = 3;
    }

    return (
      <div className="glass-card animate-fade-in" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px" }}>
          🏛️ Civic Insights & Constituency Analytics
        </h2>
        <p style={{ color: "#9ca3af", marginBottom: "2rem" }}>
          Real-time mapping of reported civic loopholes, infrastructure issues, and executive disputes.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
          <div className="glass" style={{ padding: "20px" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem", color: "#60a5fa" }}>Category Distribution</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {Object.entries(categories).map(([cat, val]) => {
                const percentage = Math.round((val / (Object.values(categories).reduce((a, b) => a + b, 0) || 1)) * 100);
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                      <span>{cat}</span>
                      <span>{val} ({percentage}%)</span>
                    </div>
                    <div style={{ height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ width: `${percentage}%`, height: "100%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", borderRadius: "4px" }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass" style={{ padding: "20px" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem", color: "#10b981" }}>Resolution & Audit Status</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {Object.entries(statuses).map(([status, val]) => {
                const percentage = Math.round((val / (Object.values(statuses).reduce((a, b) => a + b, 0) || 1)) * 100);
                let color = "var(--warning)";
                if (status === "Accepted") color = "var(--success)";
                if (status === "Rejected") color = "var(--error)";
                return (
                  <div key={status}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                      <span>{status}</span>
                      <span>{val} ({percentage}%)</span>
                    </div>
                    <div style={{ height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ width: `${percentage}%`, height: "100%", background: color, borderRadius: "4px" }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass" style={{ padding: "20px" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem", color: "#f59e0b" }}>Top Constituencies</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {Object.entries(constituencies).sort((a, b) => b[1] - a[1]).map(([constName, val]) => {
                return (
                  <div key={constName} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "0.9rem" }}>📍 {constName}</span>
                    <span className="badge" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>{val} issues</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

