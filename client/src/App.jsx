import React, { useState, useEffect, useCallback } from 'react';
import { api, getUser, saveSession, clearSession } from './api';

const money = (n) => `GHS ${Number(n).toFixed(2)}`;

const StatusBadge = ({ status }) => (
  <span className={`badge badge-${status}`}>{status}</span>
);

function Header({ user, onLogout }) {
  return (
    <header className="header">
      <div>
        <h1>🕊️ Cell Offerings Tracker</h1>
        <p className="muted">{user.name} · <span className="role-tag">{user.role}</span></p>
      </div>
      <button className="btn btn-outline" onClick={onLogout}>Log out</button>
    </header>
  );
}

/* ---------------- LOGIN ---------------- */

function Login({ onLogin }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password })
      });
      saveSession(data.token, data.user);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1>🕊️ Cell Offerings Tracker</h1>
        <p className="muted">Sign in to continue</p>
        {error && <div className="alert error">{error}</div>}
        <label>Phone number
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0244123456" inputMode="tel" required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password" required />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

/* ---------------- LEADER ---------------- */

function SubmitOffering({ onDone }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [txn, setTxn] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await api('/offerings', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          meeting_date: date,
          momo_transaction_id: txn.trim()
        })
      });
      setSuccess('Offering submitted! It is now pending verification by the treasurer.');
      setAmount('');
      setTxn('');
      onDone && onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Submit Offering</h2>
      <p className="muted">Send the offering to the church momo number, then enter the details here.</p>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}
      <label>Amount (GHS)
        <input value={amount} onChange={(e) => setAmount(e.target.value)}
          type="number" min="1" step="0.01" inputMode="decimal" placeholder="e.g. 150" required />
      </label>
      <label>Meeting date
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" required />
      </label>
      <label>Momo transaction ID
        <input value={txn} onChange={(e) => setTxn(e.target.value)}
          placeholder="From your payment confirmation SMS" required />
      </label>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit offering'}
      </button>
    </form>
  );
}

function LeaderHome({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('history');
  const [reimbursed, setReimbursed] = useState([]);

  const load = useCallback(async () => {
    try {
      const [mine, reimb] = await Promise.all([
        api('/offerings/mine'),
        api('/reimbursements/mine')
      ]);
      setData(mine);
      setReimbursed(reimb.reimbursements);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Awaiting reimbursement</span>
          <span className="stat-value gold">{money(data.totals.verified)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Reimbursed</span>
          <span className="stat-value green">{money(data.totals.reimbursed)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pending</span>
          <span className="stat-value">{money(data.totals.pending)}</span>
        </div>
      </div>

      <SubmitOffering onDone={load} />

      <div className="tabs">
        <button className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>My submissions</button>
        <button className={tab === 'reimb' ? 'tab active' : 'tab'} onClick={() => setTab('reimb')}>Reimbursements</button>
      </div>

      {tab === 'history' && (
        <div className="card">
          {data.offerings.length === 0 && <p className="muted">No submissions yet.</p>}
          {data.offerings.map((o) => (
            <div key={o.id} className="row">
              <div>
                <strong>{money(o.amount)}</strong> · {o.meeting_date}
                <div className="muted small">Txn: {o.momo_transaction_id}</div>
                {o.status === 'rejected' && o.rejection_reason && (
                  <div className="alert error small">Rejected: {o.rejection_reason}</div>
                )}
              </div>
              <div className="row-right">
                {o.reimbursed_at && <span className="badge badge-reimbursed">reimbursed</span>}
                <StatusBadge status={o.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'reimb' && (
        <div className="card">
          {reimbursed.length === 0 && <p className="muted">No reimbursements yet. Verified offerings will appear here once paid out on Sunday.</p>}
          {reimbursed.map((r) => (
            <div key={r.id} className="row">
              <div>
                <strong>{money(r.amount)}</strong> · {r.meeting_date}
                <div className="muted small">Paid {r.paid_at}</div>
              </div>
              <span className="badge badge-reimbursed">paid</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- TREASURER ---------------- */

function RejectDialog({ offering, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/offerings/${offering.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason })
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>Reject offering #{offering.id} — {offering.cell_name} ({money(offering.amount)})</h3>
      {error && <div className="alert error">{error}</div>}
      <label>Reason (the leader will see this)
        <input value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Transaction ID not found in momo messages" required />
      </label>
      <div className="btn-row">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger" disabled={busy}>{busy ? 'Rejecting…' : 'Reject'}</button>
      </div>
    </form>
  );
}

function TreasurerHome({ user }) {
  const [pending, setPending] = useState([]);
  const [due, setDue] = useState([]);
  const [totalDue, setTotalDue] = useState(0);
  const [allReimb, setAllReimb] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pending');
  const [rejecting, setRejecting] = useState(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, d, r] = await Promise.all([
        api('/offerings/pending'),
        api('/reimbursements/due'),
        api('/reimbursements')
      ]);
      setPending(p.offerings);
      setDue(d.due);
      setTotalDue(d.total_due);
      setAllReimb(r.reimbursements);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const verify = async (id) => {
    setError('');
    setMessage('');
    try {
      await api(`/offerings/${id}/verify`, { method: 'PATCH' });
      setMessage(`Offering #${id} verified.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const reimburse = async (offeringId) => {
    setError('');
    setMessage('');
    try {
      await api('/reimbursements', {
        method: 'POST',
        body: JSON.stringify({ offering_id: offeringId })
      });
      setMessage(`Reimbursed offering #${offeringId}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error && !pending.length) return <div className="alert error">{error}</div>;

  return (
    <div className="stack">
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Pending verification</span>
          <span className="stat-value">{pending.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total to reimburse</span>
          <span className="stat-value gold">{money(totalDue)}</span>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {rejecting && (
        <RejectDialog offering={rejecting}
          onDone={() => { setRejecting(null); setMessage('Offering rejected.'); load(); }}
          onCancel={() => setRejecting(null)} />
      )}

      <div className="tabs">
        <button className={tab === 'pending' ? 'tab active' : 'tab'} onClick={() => setTab('pending')}>
          Pending ({pending.length})
        </button>
        <button className={tab === 'due' ? 'tab active' : 'tab'} onClick={() => setTab('due')}>
          To reimburse ({due.length})
        </button>
        <button className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>
          History
        </button>
      </div>

      {tab === 'pending' && (
        <div className="card">
          <p className="muted">Cross-check each transaction ID against the church momo messages, then verify or reject.</p>
          {pending.length === 0 && <p className="muted">Nothing pending. 🎉</p>}
          {pending.map((o) => (
            <div key={o.id} className="row">
              <div>
                <strong>{o.cell_name}</strong> · {money(o.amount)} · {o.meeting_date}
                <div className="muted small">Txn: {o.momo_transaction_id} · by {o.leader_name}</div>
              </div>
              <div className="row-right">
                <button className="btn btn-verify" onClick={() => verify(o.id)}>Verify</button>
                <button className="btn btn-outline" onClick={() => setRejecting(o)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'due' && (
        <div className="card">
          <p className="muted">Verified offerings awaiting their Sunday payout.</p>
          {due.length === 0 && <p className="muted">Nothing to reimburse. 🎉</p>}
          {due.map((o) => (
            <div key={o.offering_id} className="row">
              <div>
                <strong>{o.cell_name}</strong> · {money(o.amount)} · {o.meeting_date}
                <div className="muted small">Leader: {o.leader_name} ({o.leader_phone})</div>
              </div>
              <button className="btn btn-primary" onClick={() => reimburse(o.offering_id)}>Mark reimbursed</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          {allReimb.length === 0 && <p className="muted">No reimbursements yet.</p>}
          {allReimb.map((r) => (
            <div key={r.id} className="row">
              <div>
                <strong>{r.cell_name}</strong> · {money(r.amount)} · {r.meeting_date}
                <div className="muted small">Txn {r.momo_transaction_id} · paid to {r.paid_to_name} by {r.paid_by_name} on {r.paid_at}</div>
              </div>
              <span className="badge badge-reimbursed">paid</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- ADMIN ---------------- */

function AdminHome({ user }) {
  const [offerings, setOfferings] = useState([]);
  const [reimb, setReimb] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api('/offerings'), api('/reimbursements')])
      .then(([o, r]) => { setOfferings(o.offerings); setReimb(r.reimbursements); })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="alert error">{error}</div>;

  const totalSubmitted = offerings.filter(o => o.status !== 'rejected').reduce((s, o) => s + o.amount, 0);
  const totalReimbursed = reimb.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="stack">
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Total offerings (not rejected)</span>
          <span className="stat-value">{money(totalSubmitted)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total reimbursed</span>
          <span className="stat-value gold">{money(totalReimbursed)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total submissions</span>
          <span className="stat-value">{offerings.length}</span>
        </div>
      </div>

      <div className="card">
        <h2>All offerings</h2>
        {offerings.length === 0 && <p className="muted">No offerings recorded yet.</p>}
        {offerings.map((o) => (
          <div key={o.id} className="row">
            <div>
              <strong>{o.cell_name}</strong> · {money(o.amount)} · {o.meeting_date}
              <div className="muted small">Txn {o.momo_transaction_id} · by {o.leader_name}</div>
            </div>
            <div className="row-right">
              {o.reimbursed_at && <span className="badge badge-reimbursed">reimbursed</span>}
              <StatusBadge status={o.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- ROOT APP ---------------- */

export default function App() {
  const [user, setUser] = useState(getUser());

  const logout = () => {
    clearSession();
    setUser(null);
  };

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <Header user={user} onLogout={logout} />
      <main>
        {user.role === 'leader' && <LeaderHome user={user} />}
        {user.role === 'treasurer' && <TreasurerHome user={user} />}
        {user.role === 'admin' && <AdminHome user={user} />}
      </main>
    </div>
  );
}
