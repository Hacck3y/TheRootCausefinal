import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

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
  status: string;
  rejection_reason?: string;
  clubbed_with_id?: number;
  created_at: string;
}

interface Dispute {
  id: number;
  submission_id: number;
  submission_title: string;
  user_id: string;
  reason: string;
  status: string;
  created_at: string;
}

interface Report {
  id: number;
  reporter_id: string;
  content_type: string;
  content_id: string;
  reason: string;
  status: string;
  created_at: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'submissions' | 'disputes' | 'reports' | 'surveys'>('submissions');
  const [adminRole, setAdminRole] = useState<string>('Post submission review');
  
  // Data lists
  const [pendingSubs, setPendingSubs] = useState<Submission[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  
  // Create Survey form
  const [surveyForm, setSurveyForm] = useState({ title: '', description: '', options: '' });

  // Rejection explanation
  const [rejectReasonMap, setRejectReasonMap] = useState<Record<number, string>>({});

  const [usingMock, setUsingMock] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Selector for active list depending on selected tab
  const getActiveItems = (): any[] => {
    if (activeTab === 'submissions') return pendingSubs;
    if (activeTab === 'disputes') return disputes;
    if (activeTab === 'reports') return reports;
    return [];
  };

  useEffect(() => {
    fetchAdminData();
    setSelectedIndex(0);
  }, [activeTab]);

  // Keydown listeners for active moderator shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key shortcuts if user is typing in inputs or textareas
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Switch tabs using 1, 2, 3, 4
      if (e.key === '1') { e.preventDefault(); setActiveTab('submissions'); }
      else if (e.key === '2') { e.preventDefault(); setActiveTab('disputes'); }
      else if (e.key === '3') { e.preventDefault(); setActiveTab('reports'); }
      else if (e.key === '4') { e.preventDefault(); setActiveTab('surveys'); }

      const items = getActiveItems();
      if (items.length === 0) return;

      // Vim or Arrow navigation
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      }

      // Perform actions on selected item
      if (activeTab === 'submissions') {
        const sub = items[selectedIndex] as Submission;
        if (!sub) return;
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          handleReviewSubmission(sub.id, 'Accepted');
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          const reasonInput = rejectReasonMap[sub.id] || '';
          if (!reasonInput) {
            const entered = prompt('Please enter a rejection reason (AI feedback fallback if blank):');
            if (entered !== null) {
              setRejectReasonMap(prev => ({ ...prev, [sub.id]: entered }));
              // Fire review submission
              const payload = { status: 'Rejected', reason: entered };
              fetch(`${API_BASE}/content/submissions/${sub.id}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              }).then(() => {
                setPendingSubs(prev => prev.filter(s => s.id !== sub.id));
                alert('Post rejected successfully.');
              });
            }
          } else {
            handleReviewSubmission(sub.id, 'Rejected');
          }
        }
      } else if (activeTab === 'disputes') {
        const disp = items[selectedIndex] as Dispute;
        if (!disp) return;
        if (e.key.toLowerCase() === 'u') {
          e.preventDefault();
          handleResolveDispute(disp.id, disp.submission_id, 'unclub');
        } else if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          handleResolveDispute(disp.id, disp.submission_id, 'keep_clubbed');
        }
      } else if (activeTab === 'reports') {
        const rep = items[selectedIndex] as Report;
        if (!rep) return;
        if (e.key.toLowerCase() === 'p') {
          e.preventDefault();
          handleResolveReport(rep.id, rep.reporter_id, true);
        } else if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          handleResolveReport(rep.id, rep.reporter_id, false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, selectedIndex, pendingSubs, disputes, reports, rejectReasonMap]);

  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, options);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn(`Gateway API offline. Falling back to local state mock in admin panel.`);
      setUsingMock(true);
      return mockAdminHandler(endpoint, options);
    }
  };

  const fetchAdminData = async () => {
    if (activeTab === 'submissions') {
      const data = await apiFetch('/content/submissions?status=Under%20Review');
      setPendingSubs(data);
    } else if (activeTab === 'disputes') {
      const data = await apiFetch('/content/disputes');
      setDisputes(data);
    } else if (activeTab === 'reports') {
      const data = await apiFetch('/community/reports');
      setReports(data);
    }
  };

  const handleReviewSubmission = async (subId: number, status: 'Accepted' | 'Rejected') => {
    const reason = rejectReasonMap[subId] || '';
    await apiFetch(`/content/submissions/${subId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason })
    });
    // Remove from active list
    setPendingSubs((prev: Submission[]) => prev.filter((s: Submission) => s.id !== subId));
    alert(`Post ${status.toLowerCase()} successfully.`);
  };

  const handleResolveDispute = async (disputeId: number, disputePostId: number, action: 'keep_clubbed' | 'unclub') => {
    if (action === 'unclub') {
      // Set clubbed_with_id to null
      await apiFetch(`/content/submissions/${disputePostId}/club`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubbedWithId: null })
      });
    }
    // Update dispute status
    await apiFetch(`/community/reports/resolve`, { // Custom resolve dispatcher in mock or backend
      method: 'POST'
    });

    setDisputes((prev: Dispute[]) => prev.filter((d: Dispute) => d.id !== disputeId));
    alert('Dispute resolved successfully.');
  };

  const handleResolveReport = async (reportId: number, targetUserId?: string, shouldBan: boolean = false) => {
    // Resolve endpoint
    await apiFetch(`/community/reports/${reportId}/resolve?banUser=${shouldBan}&userId=${targetUserId}`, {
      method: 'POST'
    });
    setReports((prev: Report[]) => prev.filter((r: Report) => r.id !== reportId));
    alert(shouldBan ? 'Content resolved and user score penalized by -100 points.' : 'Report marked as resolved.');
  };

  const handleCreateSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    const opts = surveyForm.options.split('\n').filter((o: string) => o.trim() !== '');
    if (!surveyForm.title || opts.length < 2) {
      alert('Please specify a title and at least 2 options.');
      return;
    }

    await apiFetch('/community/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: surveyForm.title,
        description: surveyForm.description,
        options: opts
      })
    });

    setSurveyForm({ title: '', description: '', options: '' });
    alert('Survey published successfully for citizens.');
  };

  // Mock handler for admin panel isolation
  const mockAdminHandler = (endpoint: string, _options: RequestInit = {}) => {
    if (endpoint.includes('/submissions')) {
      return [
        {
          id: 301,
          title: 'Illegal dumping of industrial plastics in landfill',
          description: 'Factory tankers are dumping chemical fluid and shredded plastic at night. Pungent smoke is rising.',
          category: 'Environmental',
          author_id: 'u_user442',
          profile_type: 'public',
          latitude: 12.9716,
          longitude: 77.5946,
          constituency: 'Assembly Constituency 3',
          state: 'Karnataka',
          status: 'Under Review',
          created_at: new Date().toISOString()
        },
        {
          id: 302,
          title: 'Damaged streetlights on Sector 5 footbridge',
          description: 'All 4 lamps on the footbridge are out. Commuters feel unsafe walking here after 7 PM.',
          category: 'Infrastructure',
          author_id: 'u_user11',
          profile_type: 'anonymous',
          latitude: 28.6139,
          longitude: 77.2090,
          constituency: 'Assembly Constituency 12',
          state: 'Delhi',
          status: 'Under Review',
          created_at: new Date().toISOString()
        }
      ];
    }
    if (endpoint.includes('/disputes')) {
      return [
        {
          id: 10,
          submission_id: 101,
          submission_title: 'Damaged drainage cover on Outer Ring Road',
          user_id: 'u_anon_92',
          reason: 'This post was clubbed under pothole issues on block C road, but it is an entirely separate open drainage cover 300 meters away that poses an immediate falling danger.',
          status: 'Pending',
          created_at: new Date().toISOString()
        }
      ];
    }
    if (endpoint.includes('/reports')) {
      return [
        {
          id: 51,
          reporter_id: 'u_user8',
          content_type: 'comment',
          content_id: 'v_22',
          reason: 'This comment contains abusive language targeting minor categories and other users.',
          status: 'Pending',
          created_at: new Date().toISOString()
        }
      ];
    }
    return {};
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', fontFamily: 'Outfit, sans-serif' }}>
      
      {/* Sidebar */}
      <aside style={{ width: '260px', backgroundColor: '#111827', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ color: '#60a5fa', margin: '0 0 1.5rem 0', fontSize: '1.6rem', fontWeight: 'bold' }}>
          CivicX Admin
        </h2>

        {/* Role configuration switch */}
        <div style={{ marginBottom: '2rem', padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '6px' }}>Active Staff Role</label>
          <select 
            value={adminRole} 
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAdminRole(e.target.value)} 
            style={{ width: '100%', background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '6px', fontSize: '0.85rem' }}
          >
            <option value="Post submission review">1. Post submission review</option>
            <option value="Report review">2. Report review</option>
            <option value="Data analysis">3. Data analysis</option>
            <option value="Help desk">4. Help desk</option>
          </select>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button 
            onClick={() => setActiveTab('submissions')}
            style={{ 
              background: activeTab === 'submissions' ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: activeTab === 'submissions' ? '#60a5fa' : '#9ca3af',
              border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'submissions' ? 'bold' : 'normal'
            }}
          >
            📋 Submissions Review
          </button>
          <button 
            onClick={() => setActiveTab('disputes')}
            style={{ 
              background: activeTab === 'disputes' ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: activeTab === 'disputes' ? '#60a5fa' : '#9ca3af',
              border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'disputes' ? 'bold' : 'normal'
            }}
          >
            🔗 Clubbing Disputes
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            style={{ 
              background: activeTab === 'reports' ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: activeTab === 'reports' ? '#60a5fa' : '#9ca3af',
              border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'reports' ? 'bold' : 'normal'
            }}
          >
            ⚠️ Flagged Reports
          </button>
          <button 
            onClick={() => setActiveTab('surveys')}
            style={{ 
              background: activeTab === 'surveys' ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: activeTab === 'surveys' ? '#60a5fa' : '#9ca3af',
              border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'surveys' ? 'bold' : 'normal'
            }}
          >
            🗳️ Publish Surveys
          </button>
        </nav>

        <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: '#9ca3af' }}>
          {usingMock && <span style={{ color: '#f59e0b' }}>⚠️ Sandbox Local Mocks Active</span>}
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '2.5rem', overflowY: 'auto' }}>
        <header style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>{activeTab.toUpperCase()} PANEL</h1>
          <p style={{ color: '#9ca3af', margin: '0.5rem 0 0 0' }}>Logged in with role: <strong>{adminRole}</strong></p>
          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '12px', borderRadius: '8px', marginTop: '1rem', fontSize: '0.85rem', color: '#93c5fd' }}>
            ℹ️ <strong>Staff Duty:</strong> {
              adminRole.includes('submission') ? 'Auditing and vetting user-submitted issues for EXIF validity and categories, then accepting or rejecting with constructive AI-generated reasons.' :
              adminRole.includes('Report') ? 'Auditing flagged comments or posts reported by users for terms violations, with access to score penalties (-100 points).' :
              adminRole.includes('analysis') ? 'Auditing user interaction metrics, trending counts, and geofenced constituency analytics.' :
              'Resolving questions and managing the automated chatbot help desk queue.'
            }
          </div>
          <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '12px', borderRadius: '8px', marginTop: '0.5rem', fontSize: '0.82rem', color: '#c084fc' }}>
            ⚡ <strong>Moderator Hotkeys:</strong> Switch tabs via <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>1</kbd>-<kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>4</kbd>. Navigate entries with <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>↓</kbd>/<kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>↑</kbd> or <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>j</kbd>/<kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>k</kbd>.
            {activeTab === 'submissions' && <span> Select a post and press <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>A</kbd> to Accept or <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>R</kbd> to Reject.</span>}
            {activeTab === 'disputes' && <span> Select a dispute and press <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>U</kbd> to Unclub or <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>D</kbd> to Dismiss.</span>}
            {activeTab === 'reports' && <span> Select a report and press <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>P</kbd> to Penalize user or <kbd style={{background:'rgba(255,255,255,0.08)',padding:'2px 4px',borderRadius:'4px'}}>D</kbd> to Dismiss.</span>}
          </div>
        </header>

        {activeTab === 'submissions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {pendingSubs.length === 0 ? (
              <div style={{ padding: '3rem', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', textAlign: 'center', color: '#9ca3af' }}>
                No submissions currently waiting in the review queue.
              </div>
            ) : (
              pendingSubs.map((sub: Submission, idx: number) => (
                <div 
                  key={sub.id} 
                  onClick={() => setSelectedIndex(idx)}
                  style={{ 
                    background: '#111827', 
                    border: selectedIndex === idx ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)', 
                    boxShadow: selectedIndex === idx ? '0 0 15px rgba(59, 130, 246, 0.25)' : 'none',
                    padding: '20px', 
                    borderRadius: '12px',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px' }}>
                      {sub.category}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>📍 {sub.constituency}, {sub.state}</span>
                  </div>

                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{sub.title}</h3>
                  <p style={{ fontSize: '0.95rem', color: '#d1d5db', marginBottom: '1rem' }}>{sub.description}</p>
                  
                  {/* Rejection comment input */}
                  <div style={{ marginBottom: '1rem' }}>
                    <input 
                      type="text" 
                      placeholder="Optional Rejection Reason (AI will generate feedback if blank)" 
                      style={{ width: '100%', background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '10px' }}
                      value={rejectReasonMap[sub.id] || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReasonMap((prev: Record<number, string>) => ({ ...prev, [sub.id]: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => handleReviewSubmission(sub.id, 'Accepted')}
                      style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ✓ Accept Submission
                    </button>
                    <button 
                      onClick={() => handleReviewSubmission(sub.id, 'Rejected')}
                      style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ✕ Reject Submission
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'disputes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {disputes.length === 0 ? (
              <div style={{ padding: '3rem', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', textAlign: 'center', color: '#9ca3af' }}>
                No active clubbing disputes.
              </div>
            ) : (
              disputes.map((disp: Dispute, idx: number) => (
                <div 
                  key={disp.id} 
                  onClick={() => setSelectedIndex(idx)}
                  style={{ 
                    background: '#111827', 
                    border: selectedIndex === idx ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)', 
                    boxShadow: selectedIndex === idx ? '0 0 15px rgba(59, 130, 246, 0.25)' : 'none',
                    padding: '20px', 
                    borderRadius: '12px',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    cursor: 'pointer'
                  }}
                >
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Disputed Issue: "{disp.submission_title}"</h3>
                  <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', padding: '12px', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    <strong>Dispute Rationale:</strong> {disp.reason}
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => handleResolveDispute(disp.id, disp.submission_id, 'unclub')}
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Unclub Submission
                    </button>
                    <button 
                      onClick={() => handleResolveDispute(disp.id, disp.submission_id, 'keep_clubbed')}
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Dismiss Dispute
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {reports.length === 0 ? (
              <div style={{ padding: '3rem', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', textAlign: 'center', color: '#9ca3af' }}>
                No content flags to review.
              </div>
            ) : (
              reports.map((rep: Report, idx: number) => (
                <div 
                  key={rep.id} 
                  onClick={() => setSelectedIndex(idx)}
                  style={{ 
                    background: '#111827', 
                    border: selectedIndex === idx ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)', 
                    boxShadow: selectedIndex === idx ? '0 0 15px rgba(59, 130, 246, 0.25)' : 'none',
                    padding: '20px', 
                    borderRadius: '12px',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.85rem', color: '#9ca3af' }}>
                    <span>Report Type: <strong>{rep.content_type.toUpperCase()}</strong></span>
                    <span>Target ID: {rep.content_id}</span>
                  </div>

                  <p style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>
                    <strong>Reporter Explanation:</strong> "{rep.reason}"
                  </p>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => handleResolveReport(rep.id, rep.reporter_id, true)}
                      style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      🚫 Penalize User (-100 pts)
                    </button>
                    <button 
                      onClick={() => handleResolveReport(rep.id, rep.reporter_id, false)}
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Dismiss Report
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'surveys' && (
          <div style={{ maxWidth: '600px', background: '#111827', border: '1px solid rgba(255,255,255,0.06)', padding: '24px', borderRadius: '12px' }}>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>Create Feedback Survey</h2>
            
            <form onSubmit={handleCreateSurvey}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', color: '#9ca3af' }}>Survey Title</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Public Consultation: Air Quality Act" 
                  style={{ width: '100%', background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '10px' }}
                  value={surveyForm.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSurveyForm((prev: typeof surveyForm) => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', color: '#9ca3af' }}>Description / Context</label>
                <textarea 
                  rows={3} 
                  required 
                  placeholder="Provide explanations detailing what citizens are voting on..." 
                  style={{ width: '100%', background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '10px' }}
                  value={surveyForm.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSurveyForm((prev: typeof surveyForm) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', color: '#9ca3af' }}>Options (one per line)</label>
                <textarea 
                  rows={3} 
                  required 
                  placeholder="Option 1&#10;Option 2" 
                  style={{ width: '100%', background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '10px' }}
                  value={surveyForm.options}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSurveyForm((prev: typeof surveyForm) => ({ ...prev, options: e.target.value }))}
                />
              </div>

              <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                Publish Survey
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
