import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import './LandingPage.css';

export function LandingPage() {
  const { me } = useAuth();

  // Interactive ROI Calculator State
  const [units, setUnits] = useState(45);
  // Interactive Preview Tabs: 'dashboard' | 'portal' | 'maintenance'
  const [previewTab, setPreviewTab] = useState<'dashboard' | 'portal' | 'maintenance'>('dashboard');
  // Pricing toggle
  const [annualBilling, setAnnualBilling] = useState(true);

  // Calculations for ROI
  const hoursSavedPerMonth = Math.round(units * 0.7);
  const annualSavingsRupees = (units * 750 * 12).toLocaleString('en-IN');
  const collectionSpeedDays = units > 50 ? '6.4' : '4.8';

  return (
    <div className="landing">
      {/* ── Sticky Top Navigation ────────────────────────────────────── */}
      <header className="landing-nav" role="banner">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand" aria-label="Property CRM Homepage">
            <span className="landing-brand-mark">
              <Icon name="home" size={22} stroke={2.2} />
            </span>
            <span>Property CRM</span>
          </Link>

          <nav className="landing-links" aria-label="Main Navigation">
            <a href="#features">Features</a>
            <a href="#preview">Platform Demo</a>
            <a href="#calculator">ROI Calculator</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="landing-nav-actions">
            <Link to="/portal" className="btn small" style={{ background: '#f0f3f2', color: '#08503f', fontWeight: 700 }}>
              Tenant Portal
            </Link>

            {me ? (
              <Link to="/properties" className="btn primary small" style={{ fontWeight: 700 }}>
                Go to Dashboard &rarr;
              </Link>
            ) : (
              <Link to="/login" className="btn primary small" style={{ fontWeight: 700 }}>
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────────── */}
      <section className="landing-hero" aria-labelledby="hero-heading">
        <div className="hero-glow" aria-hidden="true" />

        <div className="hero-badge">
          <span>✨</span>
          <span>Next-Gen Property Operations • Version 2.4 Live</span>
        </div>

        <h1 id="hero-heading" className="hero-title">
          Every property, tenant &amp; rupee. <br />
          <span className="hero-title-accent">Operating in flawless harmony.</span>
        </h1>

        <p className="hero-subtitle">
          Stop wrestling with fragmented spreadsheets, lost lease paperwork, and messy WhatsApp chat threads.
          Property CRM unites automated rent ledgers, tenant self-service, digital lease renewals, and maintenance dispatch into one high-velocity command center.
        </p>

        <div className="hero-cta-group">
          {me ? (
            <Link to="/properties" className="hero-btn-primary">
              <span>Open My Dashboard</span>
              <Icon name="arrow-right" size={18} stroke={2.4} />
            </Link>
          ) : (
            <Link to="/login" className="hero-btn-primary">
              <span>Launch Live System</span>
              <Icon name="arrow-right" size={18} stroke={2.4} />
            </Link>
          )}

          <Link to="/portal" className="hero-btn-secondary">
            <Icon name="phone" size={18} stroke={2} />
            <span>Tenant Mobile Portal</span>
          </Link>
        </div>

        {/* ── Trust Metrics Bar ───────────────────────────────────────── */}
        <div className="trust-bar" aria-label="Key Platform Statistics">
          <div className="trust-item">
            <span className="trust-num">10,000+</span>
            <span className="trust-label">Active Rental Units</span>
          </div>
          <div className="trust-item">
            <span className="trust-num">99.8%</span>
            <span className="trust-label">On-Time Rent Collection</span>
          </div>
          <div className="trust-item">
            <span className="trust-num">15 min</span>
            <span className="trust-label">Avg. Maintenance Response</span>
          </div>
          <div className="trust-item">
            <span className="trust-num">4.9 ★★★★★</span>
            <span className="trust-label">Landlord &amp; Tenant Rating</span>
          </div>
        </div>

        {/* ── Interactive Preview Window ──────────────────────────────── */}
        <div id="preview" className="preview-window" aria-label="Interactive Product Preview">
          <div className="preview-topbar">
            <div className="preview-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-url">app.propertycrm.com/dashboard</div>
            <div className="preview-tabs" role="tablist">
              <button
                className={`preview-tab-btn ${previewTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setPreviewTab('dashboard')}
                role="tab"
                aria-selected={previewTab === 'dashboard'}
              >
                Manager Dashboard
              </button>
              <button
                className={`preview-tab-btn ${previewTab === 'portal' ? 'active' : ''}`}
                onClick={() => setPreviewTab('portal')}
                role="tab"
                aria-selected={previewTab === 'portal'}
              >
                Tenant Portal
              </button>
              <button
                className={`preview-tab-btn ${previewTab === 'maintenance' ? 'active' : ''}`}
                onClick={() => setPreviewTab('maintenance')}
                role="tab"
                aria-selected={previewTab === 'maintenance'}
              >
                Maintenance Board
              </button>
            </div>
          </div>

          <div className="preview-content">
            {previewTab === 'dashboard' && (
              <div>
                <div className="preview-stat-grid">
                  <div className="preview-stat-card">
                    <small>Monthly Rent Roll</small>
                    <div className="preview-stat-val val">₹18,45,000</div>
                    <div className="meta">↑ 8.2% vs last month</div>
                  </div>
                  <div className="preview-stat-card">
                    <small>Collection Rate</small>
                    <div className="preview-stat-val val">96.4%</div>
                    <div className="meta">46 of 48 paid</div>
                  </div>
                  <div className="preview-stat-card">
                    <small>Occupancy Rate</small>
                    <div className="preview-stat-val val">94.8%</div>
                    <div className="meta">52 units active</div>
                  </div>
                  <div className="preview-stat-card">
                    <small>Open Tickets</small>
                    <div className="preview-stat-val val" style={{ color: '#0e7c6b' }}>3 In Progress</div>
                    <div className="meta">0 critical overdue</div>
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e3e8e6', borderRadius: 12, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong>Recent Rent Ledger Receipts</strong>
                    <span className="badge success">Live Sync Active</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f7f9f8', borderRadius: 8, fontSize: 13 }}>
                      <div><strong>Unit 402 — Priya Sharma</strong> <span className="muted">(Silver Oak Residency)</span></div>
                      <div style={{ color: '#16683b', fontWeight: 700 }}>₹32,000 • Paid via UPI</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f7f9f8', borderRadius: 8, fontSize: 13 }}>
                      <div><strong>Unit 108 — Rajesh Verma</strong> <span className="muted">(Emerald Heights)</span></div>
                      <div style={{ color: '#16683b', fontWeight: 700 }}>₹28,500 • Paid Online</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f7f9f8', borderRadius: 8, fontSize: 13 }}>
                      <div><strong>Unit 205 — Amit Patel</strong> <span className="muted">(Palm Grove Complex)</span></div>
                      <div style={{ color: '#c98a0b', fontWeight: 700 }}>₹25,000 • Due in 3 days</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {previewTab === 'portal' && (
              <div style={{ maxWidth: 440, margin: '0 auto', background: '#fff', border: '1px solid #e3e8e6', borderRadius: 16, padding: 20 }}>
                <div style={{ background: '#08503f', color: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>Welcome Back</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Priya Sharma — Unit 402</div>
                  <div style={{ marginTop: 12, fontSize: 13, background: 'rgba(255,255,255,0.12)', padding: '6px 12px', borderRadius: 8 }}>
                    Current Due: <strong>₹0.00 (All Clear)</strong>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: 14, border: '1px solid #e3e8e6', borderRadius: 10, textAlign: 'center', background: '#f7f9f8' }}>
                    <Icon name="receipt" size={20} />
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>Payment History</div>
                    <small className="muted">View &amp; receipts</small>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #e3e8e6', borderRadius: 10, textAlign: 'center', background: '#f7f9f8' }}>
                    <Icon name="wrench" size={20} />
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>Request Repair</div>
                    <small className="muted">Direct dispatch</small>
                  </div>
                </div>
              </div>
            )}

            {previewTab === 'maintenance' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ background: '#eef2f0', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#08503f', marginBottom: 10 }}>REPORTED (1)</div>
                  <div style={{ background: '#fff', padding: 12, borderRadius: 10, border: '1px solid #e3e8e6' }}>
                    <span className="badge danger" style={{ fontSize: 10 }}>Urgent</span>
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>Water heater leaking</div>
                    <small className="muted">Unit 301 • Reported 2h ago</small>
                  </div>
                </div>

                <div style={{ background: '#eef2f0', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#08503f', marginBottom: 10 }}>IN PROGRESS (2)</div>
                  <div style={{ background: '#fff', padding: 12, borderRadius: 10, border: '1px solid #e3e8e6' }}>
                    <span className="badge info" style={{ fontSize: 10 }}>Technician Assigned</span>
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>AC cooling inspection</div>
                    <small className="muted">Unit 504 • Ramesh (Staff)</small>
                  </div>
                </div>

                <div style={{ background: '#eef2f0', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#08503f', marginBottom: 10 }}>RESOLVED (14)</div>
                  <div style={{ background: '#fff', padding: 12, borderRadius: 10, border: '1px solid #e3e8e6' }}>
                    <span className="badge success" style={{ fontSize: 10 }}>Complete</span>
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>Kitchen faucet replaced</div>
                    <small className="muted">Cost: ₹1,200 • Signed off</small>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Core Features Grid ───────────────────────────────────────── */}
      <section id="features" className="landing-section" aria-labelledby="features-heading">
        <div className="section-head">
          <div className="section-tag">Enterprise Power • Consumer Simplicity</div>
          <h2 id="features-heading" className="section-title">Everything you need to command your portfolio</h2>
          <p className="section-desc">
            Engineered from real property management pain points. Built to eliminate busywork, stop revenue leaks, and keep tenants delighted.
          </p>
        </div>

        <div className="feature-grid">
          {/* Feature 1 */}
          <article className="feature-card">
            <div className="feature-icon-box">
              <Icon name="rupee" size={24} stroke={2.2} />
            </div>
            <h3>Automated Rent &amp; Ledgers</h3>
            <p>
              Pre-fill monthly rents across entire buildings in seconds. Track partial payments, automatically calculate arrears, and export tax-ready financial books.
            </p>
            <div className="feature-pill">Instant PDF Receipts</div>
          </article>

          {/* Feature 2 */}
          <article className="feature-card">
            <div className="feature-icon-box">
              <Icon name="phone" size={24} stroke={2.2} />
            </div>
            <h3>Dedicated Tenant Portal</h3>
            <p>
              Give tenants a sleek mobile web portal to view active agreements, inspect past transactions, report maintenance tickets, and upload repair photos.
            </p>
            <div className="feature-pill">Zero App Install Required</div>
          </article>

          {/* Feature 3 */}
          <article className="feature-card">
            <div className="feature-icon-box">
              <Icon name="units" size={24} stroke={2.2} />
            </div>
            <h3>Interactive Unit Inventory</h3>
            <p>
              Interactive color-coded occupancy grid showing occupied, vacant, reserved, and under-maintenance units at a single glance.
            </p>
            <div className="feature-pill">Visual Floorplan Management</div>
          </article>

          {/* Feature 4 */}
          <article className="feature-card">
            <div className="feature-icon-box">
              <Icon name="wrench" size={24} stroke={2.2} />
            </div>
            <h3>Kanban Maintenance Dispatch</h3>
            <p>
              Move work orders from Reported to In Progress to Completed. Assign tickets to maintenance staff, log vendor invoices, and notify tenants automatically.
            </p>
            <div className="feature-pill">Real-Time Activity Audit</div>
          </article>

          {/* Feature 5 */}
          <article className="feature-card">
            <div className="feature-icon-box">
              <Icon name="file" size={24} stroke={2.2} />
            </div>
            <h3>Digital Leases &amp; Expiry Alerts</h3>
            <p>
              Automated 30-day and 60-day renewal notifications prevent accidental vacancies. Track security deposits and terms without spreadsheets.
            </p>
            <div className="feature-pill">Lease Lifecycle Automation</div>
          </article>

          {/* Feature 6 */}
          <article className="feature-card">
            <div className="feature-icon-box">
              <Icon name="shield" size={24} stroke={2.2} />
            </div>
            <h3>Bank-Grade Security &amp; 2FA</h3>
            <p>
              Two-Factor Authentication (TOTP), Google OAuth sign-in, multi-tab session isolation, and granular role permissions protect sensitive financial records.
            </p>
            <div className="feature-pill">Role-Based Access Control</div>
          </article>
        </div>
      </section>

      {/* ── ROI & Savings Calculator ─────────────────────────────────── */}
      <section id="calculator" className="landing-section" aria-labelledby="calculator-heading">
        <div className="roi-box">
          <div className="roi-slider-group">
            <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', width: 'fit-content' }}>
              Real-Time Impact Estimator
            </span>
            <h2 id="calculator-heading" style={{ fontSize: 32, fontWeight: 800, margin: 0, color: '#fff' }}>
              Calculate your operational ROI
            </h2>
            <p style={{ color: '#c4e6dc', margin: 0, fontSize: 16 }}>
              Move the slider to see how much time and money Property CRM saves your management team every month.
            </p>

            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 700, fontSize: 15 }}>
                <span>Portfolio Size:</span>
                <span style={{ fontSize: 18, color: '#fff' }}>{units} Units</span>
              </div>
              <input
                type="range"
                min="5"
                max="300"
                step="5"
                value={units}
                onChange={(e) => setUnits(Number(e.target.value))}
                className="roi-slider"
                aria-label="Number of units in your portfolio"
              />
            </div>
          </div>

          <div className="roi-results">
            <div className="roi-metric">
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#c4e6dc' }}>Administrative Time Saved</div>
                <small style={{ color: 'rgba(255,255,255,0.7)' }}>Automated notices &amp; reconciliation</small>
              </div>
              <div className="roi-metric-num">~{hoursSavedPerMonth} hrs/mo</div>
            </div>

            <div className="roi-metric">
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#c4e6dc' }}>Accelerated Rent Collection</div>
                <small style={{ color: 'rgba(255,255,255,0.7)' }}>Faster tenant portal payments</small>
              </div>
              <div className="roi-metric-num">{collectionSpeedDays} days faster</div>
            </div>

            <div className="roi-metric">
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#c4e6dc' }}>Estimated Annual Operational Value</div>
                <small style={{ color: 'rgba(255,255,255,0.7)' }}>Staff efficiency &amp; zero missed arrears</small>
              </div>
              <div className="roi-metric-num">₹{annualSavingsRupees}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Transparent Pricing ─────────────────────────────────────── */}
      <section id="pricing" className="landing-section" aria-labelledby="pricing-heading">
        <div className="section-head">
          <div className="section-tag">Simple &amp; Predictable</div>
          <h2 id="pricing-heading" className="section-title">Transparent pricing for portfolios of any size</h2>
          <p className="section-desc">
            No hidden setup fees. No surprises. Start free and scale seamlessly as your units grow.
          </p>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 24, background: '#fff', border: '1px solid #e3e8e6', padding: '6px 14px', borderRadius: 999 }}>
            <span style={{ fontWeight: annualBilling ? 600 : 700, color: annualBilling ? '#5a6864' : '#0f1f1c', fontSize: 14 }}>Monthly</span>
            <button
              onClick={() => setAnnualBilling(!annualBilling)}
              style={{ width: 44, height: 24, borderRadius: 12, background: '#0e7c6b', border: 'none', cursor: 'pointer', position: 'relative' }}
              aria-label="Toggle annual billing"
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: annualBilling ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                }}
              />
            </button>
            <span style={{ fontWeight: annualBilling ? 700 : 600, color: annualBilling ? '#0f1f1c' : '#5a6864', fontSize: 14 }}>
              Annual <span style={{ color: '#16683b', background: '#e1f3e7', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>Save 20%</span>
            </span>
          </div>
        </div>

        <div className="pricing-grid">
          {/* Plan 1 */}
          <div className="pricing-card">
            <h3>Starter</h3>
            <p>Perfect for independent landlords with small multi-family properties.</p>
            <div className="pricing-price">
              {annualBilling ? '₹1,999' : '₹2,499'}
              <small>/ month</small>
            </div>
            <ul className="pricing-features">
              <li><span className="check">✓</span> Up to 25 Units</li>
              <li><span className="check">✓</span> Automated Rent Ledger</li>
              <li><span className="check">✓</span> Tenant Mobile Portal</li>
              <li><span className="check">✓</span> Maintenance Work Orders</li>
              <li><span className="check">✓</span> Standard Email Support</li>
            </ul>
            <Link to="/login" className="btn secondary" style={{ fontWeight: 700 }}>
              Start Free 14-Day Trial
            </Link>
          </div>

          {/* Plan 2: Featured */}
          <div className="pricing-card featured">
            <span className="pricing-badge">Most Popular</span>
            <h3>Professional</h3>
            <p>For growing property management agencies and building operators.</p>
            <div className="pricing-price">
              {annualBilling ? '₹4,999' : '₹5,999'}
              <small>/ month</small>
            </div>
            <ul className="pricing-features">
              <li><span className="check">✓</span> Up to 100 Units</li>
              <li><span className="check">✓</span> Everything in Starter</li>
              <li><span className="check">✓</span> Multi-Role Access (Managers &amp; Staff)</li>
              <li><span className="check">✓</span> Two-Factor Authentication (2FA)</li>
              <li><span className="check">✓</span> Automated Lease Renewal Alerts</li>
              <li><span className="check">✓</span> Owner &amp; Investor Distribution Reports</li>
            </ul>
            <Link to="/login" className="btn primary" style={{ fontWeight: 700 }}>
              Start Free 14-Day Trial
            </Link>
          </div>

          {/* Plan 3 */}
          <div className="pricing-card">
            <h3>Enterprise</h3>
            <p>For commercial operators and real estate firms managing 100+ units.</p>
            <div className="pricing-price">
              {annualBilling ? '₹9,999' : '₹11,999'}
              <small>/ month</small>
            </div>
            <ul className="pricing-features">
              <li><span className="check">✓</span> Unlimited Units &amp; Properties</li>
              <li><span className="check">✓</span> Custom Role &amp; Permission Schemes</li>
              <li><span className="check">✓</span> Dedicated Account Manager</li>
              <li><span className="check">✓</span> High-Volume SMS &amp; WhatsApp Gateways</li>
              <li><span className="check">✓</span> 99.9% Uptime SLA &amp; Priority Dispatch</li>
            </ul>
            <Link to="/login" className="btn secondary" style={{ fontWeight: 700 }}>
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ Section (GEO & AI Search Optimized) ─────────────────── */}
      <section id="faq" className="landing-section" aria-labelledby="faq-heading">
        <div className="section-head">
          <div className="section-tag">Frequently Asked Questions</div>
          <h2 id="faq-heading" className="section-title">Answers to common questions</h2>
          <p className="section-desc">
            Everything you need to know about setting up, onboarding tenants, and scaling with Property CRM.
          </p>
        </div>

        <div className="faq-list">
          <details className="faq-item" open>
            <summary className="faq-summary">
              <span>What is Property CRM and who is it designed for?</span>
              <Icon name="chevron-down" size={18} />
            </summary>
            <div className="faq-answer">
              Property CRM is an all-in-one cloud property management platform built for residential and commercial landlords, property managers, property owners, and tenants. It replaces disjointed spreadsheets, paper receipts, and WhatsApp threads with centralized unit tracking, automated rent prefilling, digital lease agreements, and maintenance work orders.
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-summary">
              <span>How does the Tenant Portal simplify rent and repairs?</span>
              <Icon name="chevron-down" size={18} />
            </summary>
            <div className="faq-answer">
              Tenants receive a mobile-friendly portal link where they can view their lease details, check their live rent balance, download official payment receipts, and submit maintenance tickets with photos. They do not need to download an app from an app store.
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-summary">
              <span>Can I manage multiple roles (Owners, Staff, Managers, Tenants)?</span>
              <Icon name="chevron-down" size={18} />
            </summary>
            <div className="faq-answer">
              Yes. Property CRM features granular role-based access control (RBAC). Company Administrators have full access, Property Managers oversee assigned buildings, Maintenance Staff receive assigned work orders, Owners view financial payout summaries, and Tenants access their self-service portal. Changes to user roles update in real time across active sessions.
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-summary">
              <span>What security measures protect my financial and property data?</span>
              <Icon name="chevron-down" size={18} />
            </summary>
            <div className="faq-answer">
              Property CRM enforces bank-grade encryption, rate limiting against brute-force attacks, Two-Factor Authentication (2FA via TOTP authenticator apps like Google or Microsoft Authenticator), Sign in with Google (OAuth 2.0), and secure httpOnly cookie authentication with token rotation.
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-summary">
              <span>How easy is it to migrate from spreadsheets or existing records?</span>
              <Icon name="chevron-down" size={18} />
            </summary>
            <div className="faq-answer">
              You can get started in less than 5 minutes. Create your properties, add your units (or use bulk unit generation), invite tenants by email, and generate active leases. Your monthly rent ledger is automatically calculated based on your unit rates.
            </div>
          </details>
        </div>
      </section>

      {/* ── Final Call to Action ────────────────────────────────────── */}
      <section className="landing-cta" aria-labelledby="cta-heading">
        <h2 id="cta-heading">Ready to transform your property operations?</h2>
        <p>
          Join hundreds of forward-thinking property managers and landlords saving 20+ hours each month with Property CRM.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/login" className="hero-btn-primary">
            <span>Get Started with Property CRM</span>
            <Icon name="arrow-right" size={18} stroke={2.4} />
          </Link>
          <Link to="/portal" className="hero-btn-secondary" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
            <span>Tenant Portal Login</span>
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="landing-brand-mark" style={{ width: 32, height: 32 }}>
              <Icon name="home" size={18} stroke={2.2} />
            </span>
            <strong style={{ fontSize: 16, color: '#08503f' }}>Property CRM</strong>
            <span className="muted" style={{ marginLeft: 8 }}>&copy; {new Date().getFullYear()} All rights reserved.</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span className="footer-status">
              <span className="status-dot" />
              <span>All Systems Operational</span>
            </span>
            <Link to="/login" style={{ fontWeight: 600, fontSize: 13.5, color: '#4b5855' }}>
              Sign In
            </Link>
            <Link to="/portal" style={{ fontWeight: 600, fontSize: 13.5, color: '#4b5855' }}>
              Tenant Portal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
