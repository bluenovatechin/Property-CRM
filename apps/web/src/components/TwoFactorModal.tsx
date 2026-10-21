import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Chip, ErrorNote, Modal, useToast } from './ui';

export function TwoFactorModal({ onClose }: { onClose: () => void }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const [loading, setLoading] = useState(!me?.twoFactorEnabled);
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!me?.twoFactorEnabled) {
      setLoading(true);
      api
        .get<{ secret: string; qrCode: string }>('/auth/2fa/setup')
        .then((res) => setSetupData(res))
        .catch((e) => setError(e))
        .finally(() => setLoading(false));
    }
  }, [me?.twoFactorEnabled]);

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/2fa/enable', { secret: setupData.secret, code: code.trim() });
      qc.setQueryData(['me'], (prev: any) => (prev ? { ...prev, twoFactorEnabled: true } : prev));
      toast('Two-factor authentication enabled successfully!');
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/2fa/disable', { code: code.trim() });
      qc.setQueryData(['me'], (prev: any) => (prev ? { ...prev, twoFactorEnabled: false } : prev));
      toast('Two-factor authentication has been disabled.');
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const copySecret = () => {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      title="Two-Factor Authentication (2FA)"
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose} disabled={busy}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ErrorNote error={error} />

        {me?.twoFactorEnabled ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Chip tone="success">Active</Chip>
              <span style={{ fontWeight: 600 }}>Your account is protected by 2FA</span>
            </div>
            <p className="muted small" style={{ margin: '0 0 16px' }}>
              Whenever you sign in with your email or Google account, you will be prompted for a 6-digit code from your authenticator app.
            </p>

            <form onSubmit={handleDisable} style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Disable 2FA</h4>
              <p className="muted small" style={{ margin: '0 0 10px' }}>
                Enter the current 6-digit code from your authenticator app to turn off two-factor authentication:
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  style={{ width: 140, letterSpacing: '3px', fontWeight: 700, textAlign: 'center' }}
                  required
                />
                <button type="submit" className="btn danger" disabled={busy || code.length < 6}>
                  {busy ? 'Disabling…' : 'Disable 2FA'}
                </button>
              </div>
            </form>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 24 }} className="muted">
            Generating your authenticator setup…
          </div>
        ) : setupData ? (
          <div>
            <p className="muted small" style={{ margin: '0 0 14px' }}>
              Protect your account from unauthorized access by requiring a one-time code from an authenticator app (Google Authenticator, Authy, or Microsoft Authenticator).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fff', padding: 14, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
              <img src={setupData.qrCode} alt="2FA QR Code" style={{ width: 180, height: 180, display: 'block' }} />
              <div style={{ marginTop: 10, fontSize: 13, textAlign: 'center' }}>
                <span className="muted">Can't scan? </span>
                <code style={{ fontSize: 12, padding: '2px 6px', background: 'var(--bg-muted, #f3f4f6)', borderRadius: 4 }}>{setupData.secret}</code>
                <button type="button" onClick={copySecret} className="btn ghost sm" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 12 }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <form onSubmit={handleEnable}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Enter the 6-digit verification code from your app:
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  style={{ width: 140, letterSpacing: '3px', fontWeight: 700, textAlign: 'center' }}
                  autoFocus
                  required
                />
                <button type="submit" className="btn primary" disabled={busy || code.length < 6}>
                  {busy ? 'Verifying…' : 'Enable 2FA'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
