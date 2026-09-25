import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import '../../styles/user.css';

const AdminLogin = () => {
  const { loginAdmin } = useContext(AuthContext);
  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginEmail, setLoginEmail] = useState('civivision@gmail.com');
  const [loginPassword, setLoginPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (loginEmail.toLowerCase().trim() !== 'civivision@gmail.com') {
      setErrorMessage('Access Denied: Only official admin email civivision@gmail.com is authorized.');
      return;
    }

    setIsSubmitting(true);
    const success = await loginAdmin(loginEmail, loginPassword);
    setIsSubmitting(false);
    if (success) {
      navigate('/admin/dashboard');
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 65px)', padding: '36px 20px 80px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
        
        <div className="auth-split-layout">
          
          {/* Left Side: Municipal Officer Capabilities */}
          <div className="auth-hero-info">
            <span className="badge-pill-detailed badge-pill-indigo" style={{ marginBottom: '14px' }}>
              🛡️ GMC Ward Officer Access
            </span>
            <h1 style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-0.75px', color: 'var(--text-primary, #0f172a)', lineHeight: '1.2', marginBottom: '16px' }}>
              Municipal Ward Control & Dispatch Operations
            </h1>
            <p style={{ fontSize: '14.5px', color: 'var(--text-muted, #64748b)', lineHeight: '1.6', marginBottom: '24px' }}>
              Centralized administrative dashboard for Gandhinagar Municipal Corporation ward inspectors, sanitation squad supervisors, and engineering leads.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
                  🗺️
                </div>
                <div>
                  <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-primary, #0f172a)' }}>Live Spatial Heatmaps</strong>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted, #64748b)' }}>18-ward real-time grievance pin visualization</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.1)', color: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
                  ⚡
                </div>
                <div>
                  <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-primary, #0f172a)' }}>SLA Emergency Dispatch</strong>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted, #64748b)' }}>Automatic 2-hour alerts for critical water/road risks</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
                  🔍
                </div>
                <div>
                  <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-primary, #0f172a)' }}>AI Anti-Fraud Verification</strong>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted, #64748b)' }}>Audit after-fix proof photos & release Swachh credits</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Admin Login Card */}
          <div className="glass-card-detailed" style={{ padding: '36px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 4px 0', color: 'var(--text-primary, #0f172a)' }}>
                  Officer Login
                </h2>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #64748b)', margin: 0 }}>
                  Sign in to access GMC administrative control room
                </p>
              </div>
              <span className="badge-pill-detailed badge-pill-indigo" style={{ fontSize: '11px' }}>
                GMC Security
              </span>
            </div>

            {errorMessage && (
              <div style={{ padding: '10px 14px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', fontSize: '13px', marginBottom: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                ⚠️ {errorMessage}
              </div>
            )}

            <form onSubmit={handleLoginSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary, #0f172a)', display: 'block', marginBottom: '6px' }}>
                  Official Administrator Email
                </label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="e.g. civivision@gmail.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary, #0f172a)', display: 'block', marginBottom: '6px' }}>
                  Officer Security Password
                </label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Enter administrator password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                style={{ width: '100%', padding: '12px', background: '#0f172a', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: isSubmitting ? 'not-allowed' : 'pointer', boxShadow: '0 4px 15px rgba(15, 23, 42, 0.3)' }}
              >
                {isSubmitting ? 'Authenticating...' : 'Sign In as Municipal Admin'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '20px', padding: '12px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.03)', border: '1px solid rgba(15, 23, 42, 0.06)', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                ℹ️ Administrative registration is strictly restricted. For new officer provisioning, contact the GMC IT Directorate.
              </div>
            </form>
          </div>

        </div>

      </div>

      <style jsx="true" global="true">{`
        .auth-split-layout {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 40px;
          align-items: center;
        }
        @media (max-width: 860px) {
          .auth-split-layout {
            grid-template-columns: 1fr;
            gap: 24px;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminLogin;
