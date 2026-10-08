import { useState, useEffect } from 'react';
import './App.css';
import { Book, Library, ArrowRight, ShieldCheck, BookmarkCheck } from 'lucide-react';
import { isSupabaseConfigured } from './config/supabase';

export function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'eligibility' | 'overdue'>('catalog');
  const [backendStatus, setBackendStatus] = useState<string>('Checking...');
  const [books, setBooks] = useState<any[]>([]);
  const [patronId, setPatronId] = useState('STU-2026-0001');
  const [patronResult, setPatronResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((d) => setBackendStatus(d.status === 'ok' ? 'Connected (:5001)' : 'Offline'))
      .catch(() => setBackendStatus('Offline'));

    fetch('/api/v1/books')
      .then((res) => res.json())
      .then((data) => setBooks(data))
      .catch(() => {});
  }, []);

  const handleVerifyPatron = async () => {
    setChecking(true);
    setPatronResult(null);
    try {
      const res = await fetch(`/api/v1/loans/verify-patron/${patronId}`);
      const data = await res.json();
      setPatronResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setPatronResult(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-crest">
            <Library size={28} color="#fff" />
          </div>
          <div>
            <h1 className="brand-title">Frighton University LMS</h1>
            <p className="brand-subtitle">Library Management System & Archive</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div className="badge">
            <span className={`badge-dot ${backendStatus.includes('Connected') ? 'online' : 'pending'}`}></span>
            <span>LMS API: {backendStatus}</span>
          </div>
          <div className="badge">
            <span className={`badge-dot ${isSupabaseConfigured ? 'online' : 'pending'}`}></span>
            <span>Supabase: {isSupabaseConfigured ? 'Connected' : 'Credentials Needed'}</span>
          </div>
        </div>
      </header>

      <nav className="tabs-nav">
        <button 
          className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          <Book size={18} /> Library Catalog
        </button>
        <button 
          className={`tab-btn ${activeTab === 'eligibility' ? 'active' : ''}`}
          onClick={() => setActiveTab('eligibility')}
        >
          <ShieldCheck size={18} /> SIS Patron Standing Verifier
        </button>
        <button 
          className={`tab-btn ${activeTab === 'overdue' ? 'active' : ''}`}
          onClick={() => setActiveTab('overdue')}
        >
          <BookmarkCheck size={18} /> Overdue Holds & Clearance
        </button>
      </nav>

      {activeTab === 'catalog' && (
        <section>
          <div className="card">
            <h2 className="card-title"><Book size={20} color="#10b981" /> University Library Collection</h2>
            <p className="card-description">
              Browse textbooks, manuscripts, and archive collections. Loans require active standing in Frighton SIS.
            </p>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Category</th>
                  <th>ISBN</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.title}</strong></td>
                    <td>{b.author}</td>
                    <td>{b.category}</td>
                    <td><code>{b.isbn}</code></td>
                    <td>
                      <span style={{ color: b.availableCopies > 0 ? '#10b981' : '#f43f5e', fontWeight: 600 }}>
                        {b.availableCopies} / {b.totalCopies} Available
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'eligibility' && (
        <section>
          <div className="card">
            <h2 className="card-title"><ShieldCheck size={20} color="#06b6d4" /> Check Student Borrowing Eligibility in SIS</h2>
            <p className="card-description">
              This calls the LMS backend (port 5001), which queries the Frighton SIS API (port 5000) using the shared secret key to check enrollment and academic holds.
            </p>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                value={patronId} 
                onChange={(e) => setPatronId(e.target.value)}
                placeholder="Enter Student ID (e.g. STU-2026-0001)"
                style={{
                  background: '#05070a',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.9rem',
                  flex: 1
                }}
              />
              <button 
                className="action-btn"
                onClick={handleVerifyPatron}
                disabled={checking}
              >
                {checking ? 'Querying SIS...' : 'Verify Patron Standing'} <ArrowRight size={16} />
              </button>
            </div>

            {patronResult && (
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Response received from SIS via LMS backend:
                </p>
                <pre className="code-block" style={{ maxHeight: '250px' }}>
                  {patronResult}
                </pre>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'overdue' && (
        <section>
          <div className="card">
            <h2 className="card-title"><BookmarkCheck size={20} color="#f59e0b" /> Academic Holds Bridge</h2>
            <p className="card-description">
              When materials are overdue or lost, the Library Management System posts a hold directly into Frighton SIS, blocking course registration or graduation until cleared.
            </p>
            <div className="code-block">
              POST /api/v1/loans/report-overdue<br />
              Target: SIS API /api/v1/integration/holds<br />
              Header: X-LMS-API-KEY
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
