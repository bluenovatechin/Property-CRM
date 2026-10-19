import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def create_document():
    doc = docx.Document()
    
    # Page setup - 1 inch margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)
        
    # Color Palette Constants
    HEX_PRIMARY = "1E3A8A"      # Deep Navy Blue
    HEX_SECONDARY = "0284C7"    # Sky / Cerulean Blue
    HEX_DARK = "0F172A"         # Slate 900
    HEX_MUTED = "475569"        # Slate 600
    HEX_BG_LIGHT = "F8FAFC"     # Slate 50
    HEX_BORDER = "CBD5E1"       # Slate 300
    HEX_ACCENT_GREEN = "059669" # Emerald
    HEX_ACCENT_AMBER = "D97706" # Amber
    HEX_ACCENT_RED = "DC2626"   # Red
    
    COLOR_PRIMARY = RGBColor(0x1E, 0x3A, 0x8A)
    COLOR_SECONDARY = RGBColor(0x02, 0x84, 0xC7)
    COLOR_DARK = RGBColor(0x0F, 0x17, 0x2A)
    COLOR_MUTED = RGBColor(0x47, 0x55, 0x69)
    
    # Configure Normal Style
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Calibri'
    style_normal.font.size = Pt(10.5)
    style_normal.font.color.rgb = COLOR_DARK
    style_normal.paragraph_format.line_spacing = 1.15
    style_normal.paragraph_format.space_after = Pt(4)
    
    # Helper XML functions
    def set_cell_background(cell, hex_color):
        shading_xml = f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>'
        cell._tc.get_or_add_tcPr().append(parse_xml(shading_xml))
        
    def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = OxmlElement('w:tcMar')
        for margin_name, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
            node = OxmlElement(margin_name)
            node.set(qn('w:w'), str(val))
            node.set(qn('w:type'), 'dxa')
            tcMar.append(node)
        tcPr.append(tcMar)

    def set_cell_border(cell, **kwargs):
        """
        kwargs: top, bottom, left, right
        values: dict(sz=12, val='single', color='1E3A8A', space='0')
        """
        tcPr = cell._tc.get_or_add_tcPr()
        tcBorders = OxmlElement('w:tcBorders')
        for b_name in ['top', 'left', 'bottom', 'right']:
            if b_name in kwargs:
                edge = OxmlElement(f'w:{b_name}')
                for key, val in kwargs[b_name].items():
                    edge.set(qn(f'w:{key}'), str(val))
                tcBorders.append(edge)
            else:
                edge = OxmlElement(f'w:{b_name}')
                edge.set(qn('w:val'), 'none')
                tcBorders.append(edge)
        tcPr.append(tcBorders)
        
    def add_callout(text, title=None, hex_bg="F1F5F9", hex_border="1E3A8A"):
        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        cell = table.rows[0].cells[0]
        cell.width = Inches(6.5)
        set_cell_background(cell, hex_bg)
        set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
        set_cell_border(cell, left=dict(sz=24, val='single', color=hex_border))
        
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.15
        if title:
            run_title = p.add_run(f"📌 {title}\n")
            run_title.bold = True
            run_title.font.name = 'Calibri'
            run_title.font.size = Pt(11)
            run_title.font.color.rgb = COLOR_PRIMARY
        run_text = p.add_run(text)
        run_text.font.name = 'Calibri'
        run_text.font.size = Pt(10)
        run_text.font.color.rgb = COLOR_DARK
        doc.add_paragraph().paragraph_format.space_after = Pt(2)

    def add_heading_1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Calibri'
        run.font.size = Pt(16)
        run.font.color.rgb = COLOR_PRIMARY
        return p

    def add_heading_2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Calibri'
        run.font.size = Pt(13)
        run.font.color.rgb = COLOR_SECONDARY
        return p

    def add_heading_3(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(7)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Calibri'
        run.font.size = Pt(11)
        run.font.color.rgb = COLOR_DARK
        return p

    def add_bullet(text, bold_prefix=None, level=0):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.15
        p.paragraph_format.left_indent = Inches(0.25 * (level + 1))
        if bold_prefix:
            run_b = p.add_run(bold_prefix + ": ")
            run_b.bold = True
            run_b.font.name = 'Calibri'
            run_b.font.color.rgb = COLOR_DARK
        run_t = p.add_run(text)
        run_t.font.name = 'Calibri'
        run_t.font.color.rgb = COLOR_DARK
        return p

    def create_styled_table(headers, data, col_widths=None):
        table = doc.add_table(rows=len(data) + 1, cols=len(headers))
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        
        # Header Row
        hdr_row = table.rows[0]
        tblPr = table._tbl.tblPr
        tblCellMar = OxmlElement('w:tblCellMar')
        for side, dxa in [('top', 100), ('bottom', 100), ('left', 140), ('right', 140)]:
            node = OxmlElement(f'w:{side}')
            node.set(qn('w:w'), str(dxa))
            node.set(qn('w:type'), 'dxa')
            tblCellMar.append(node)
        tblPr.append(tblCellMar)

        for i, h_text in enumerate(headers):
            cell = hdr_row.cells[i]
            set_cell_background(cell, HEX_PRIMARY)
            set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            run = p.add_run(h_text)
            run.bold = True
            run.font.name = 'Calibri'
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            
        # Data Rows
        for r_idx, row_values in enumerate(data):
            row = table.rows[r_idx + 1]
            bg_color = HEX_BG_LIGHT if r_idx % 2 == 1 else "FFFFFF"
            for c_idx, val in enumerate(row_values):
                cell = row.cells[c_idx]
                set_cell_background(cell, bg_color)
                set_cell_margins(cell, top=80, bottom=80, left=140, right=140)
                set_cell_border(cell, 
                                top=dict(sz=4, val='single', color=HEX_BORDER),
                                bottom=dict(sz=4, val='single', color=HEX_BORDER),
                                left=dict(sz=4, val='single', color=HEX_BORDER),
                                right=dict(sz=4, val='single', color=HEX_BORDER))
                p = cell.paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(1)
                run = p.add_run(str(val))
                run.font.name = 'Calibri'
                run.font.size = Pt(9.5)
                run.font.color.rgb = COLOR_DARK
                
        if col_widths:
            for row in table.rows:
                for c_idx, w in enumerate(col_widths):
                    row.cells[c_idx].width = Inches(w)
                    
        doc.add_paragraph().paragraph_format.space_after = Pt(4)
        return table

    # -------------------------------------------------------------
    # DOCUMENT HEADER / TITLE SECTION
    # -------------------------------------------------------------
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(10)
    title_p.paragraph_format.space_after = Pt(2)
    run_t = title_p.add_run("PROPERTY MANAGEMENT CRM")
    run_t.bold = True
    run_t.font.name = 'Calibri'
    run_t.font.size = Pt(24)
    run_t.font.color.rgb = COLOR_PRIMARY
    
    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(12)
    run_sub = sub_p.add_run("Complete Technical Architecture, MVP Blueprint & Comprehensive Intern Execution Plan\n(Addressing Key Brief Points: 16, 18, 19, 20, 21, 22, 23, 24 & 25)")
    run_sub.font.name = 'Calibri'
    run_sub.font.size = Pt(12)
    run_sub.font.color.rgb = COLOR_SECONDARY
    
    # Metadata Block
    meta_data = [
        ["Document Purpose", "Intern Technical Solution, Architectural Specifications & Senior Review Presentation"],
        ["Target Audience", "Senior Technical Lead, Project Manager, Evaluators & Intern Engineering Team"],
        ["Project Domain", "Real Estate SaaS / Multi-Unit Property & Rental Asset Management CRM"],
        ["Document Status", "Final Architectural Blueprint & Development Proposal (v1.0 Ready for Sign-Off)"]
    ]
    create_styled_table(["Metadata Key", "Specification Details"], meta_data, col_widths=[2.0, 4.5])
    
    # -------------------------------------------------------------
    # SECTION 0: EXECUTIVE SUMMARY & INTERN LEARNINGS
    # -------------------------------------------------------------
    add_heading_1("Executive Summary: What I Learned as an Intern & My Strategic Vision")
    
    add_callout(
        "\"The purpose of this project is not merely to write standard CRUD forms, but to engineer an integrated, "
        "relational operational cockpit for property managers—eliminating fragmented spreadsheets, untracked rent dues, "
        "and chaotic WhatsApp messages. My goal as an intern is to transform these complex business requirements into "
        "a clean, scalable, production-ready system that any senior engineer would be proud to approve.\"",
        title="Intern Perspective & Engineering Mindset"
    )
    
    add_heading_2("1. Key Takeaways from the Property Management Brief")
    add_bullet("Traditional property management collapses when scaling from 5 to 100+ units because managers rely on scattered Excel sheets, paper registers, and chat messages. This causes revenue leakage (missed rent, uncollected deposits), untracked maintenance disputes, and expired lease blindspots.", "The Core Problem")
    add_bullet("Every entity is strictly interconnected: Owner owns Properties -> Property has Units -> Unit has Lease -> Lease binds Tenant -> Lease generates Monthly Payments -> Unit drives Maintenance requests. A clean relational schema is essential.", "Relational Interdependence")
    add_bullet("A Property Manager needs to know the exact health of 100 units within 10 to 15 seconds of opening the dashboard: Total Occupied, Vacant, Pending Dues, Overdue Tenants, and Urgent Maintenance tickets.", "The 15-Second Dashboard Rule")
    add_bullet("Rather than attempting an unfinishable monolithic platform, engineering discipline dictates locking a pristine Minimum Viable Product (MVP) first, validating core workflows, and deferring advanced add-ons (automated WhatsApp bots, e-signatures, payment gateway gateways) to Phase 2.", "Engineering Discipline (Scope Lock)")
    
    add_heading_2("2. My Structured Plan to Present to My Senior")
    add_bullet("Lock the exact data contracts and feature boundaries defined in Point 16 so the scope does not balloon.", "Phase 1: Scope Lock & MVP Definition")
    add_bullet("Propose modern, robust, industry-standard stack choices (React + Node.js/Express + PostgreSQL + Prisma) with clear architectural justifications for Point 18.", "Phase 2: Technical Architecture Feasibility")
    add_bullet("Execute and deliver all 14 concrete engineering artifacts outlined in Point 19 (ER diagrams, RBAC matrix, API specs, wireframes, and test plans).", "Phase 3: Concrete Deliverables Delivery")
    add_bullet("Confidently answer all 12 senior evaluation questions (Point 20) and deliver an engaging 16-slide walkthrough (Point 21).", "Phase 4: Senior Presentation & Verification")
    
    doc.add_page_break()
    
    # -------------------------------------------------------------
    # SECTION 16: MVP - પ્રથમ VERSIONમાં શું બનાવવું?
    # -------------------------------------------------------------
    add_heading_1("Point 16: MVP Scope Lock – પ્રથમ Versionમાં શું બનાવવું?")
    
    p = doc.add_paragraph("In a software development internship, the number one reason projects fail or miss deadlines is scope creep. As an intern, my strategic decision is to establish a strict boundary between Phase 1 (Core MVP) and Phase 2 (Advanced Scope). The MVP must deliver a completely functional, bug-free end-to-end workflow for a 100-unit property before adding complex third-party integrations.")
    
    add_heading_2("16.1 Phase 1 (MVP) – Fully Functional Core Modules")
    
    mvp_modules_data = [
        ["1. Authentication & RBAC", "Secure JWT login, password encryption (bcrypt), role identification (Admin, Property Manager, Accountant, Maintenance Staff)."],
        ["2. Property Management", "Create, edit, view, archive properties (Name, Address, Type: Residential/Commercial, Total Units, Owner assignment)."],
        ["3. Unit Management", "Unit inventory creation under properties (Flat/Shop #, Floor, Wing, Area sq.ft, Base Rent, Deposit, Status: Vacant/Occupied/Reserved/Maintenance)."],
        ["4. Tenant Management", "Tenant registry (Name, Mobile, Email, Identification/KYC, Emergency Contact, Assigned Unit, Status: Active/Inactive/Archived)."],
        ["5. Lease / Agreement", "Lease creation binding Unit + Tenant (Start Date, End Date, Monthly Rent Amount, Security Deposit Paid, Rent Due Day of Month, Document Attachment)."],
        ["6. Rent & Payment Tracker", "Monthly rent dues ledger generation, mark payment (Paid / Pending / Overdue), payment date, mode (Cash/UPI/Cheque/Bank Transfer), receipt note, partial payments."],
        ["7. Maintenance Desk", "Ticket logging (Category: Plumbing/Electrical/Carpentry/Other, Priority: Low/Med/High/Urgent, Description, Assigned Staff, Status: Open/In-Progress/Resolved/Closed, Cost)."],
        ["8. Executive Dashboard", "Real-time KPI cards (Total Units, Occupancy %, Monthly Rent Collected vs Pending, Overdue count, Open maintenance tickets) + quick search/filter."],
        ["9. Basic Operational Reports", "Exportable/viewable tables: Unit Occupancy Report, Monthly Rent Defaulters/Overdue Report, Lease Expiry in next 30 days, Maintenance Cost summary."]
    ]
    create_styled_table(["Core MVP Module", "Delivered Functional Scope"], mvp_modules_data, col_widths=[2.2, 4.3])
    
    add_heading_2("16.2 Phase 2 (Post-MVP Enhancements – Strictly Deferred)")
    add_bullet("Integrated payment processing (Razorpay / Stripe) with automatic payment webhook reconciliation.", "Online Payment Gateway")
    add_bullet("Dedicated tenant self-service portal / mobile app for viewing lease, paying rent, and logging maintenance with camera photos.", "Tenant Mobile App / Portal")
    add_bullet("Automated SMS/WhatsApp API triggers (Twilio / Gupshup / WhatsApp Cloud API) for automated payment reminders.", "WhatsApp / SMS Auto-Dispatch")
    add_bullet("Digitally legal lease agreement creation with Aadhaar e-Sign or DocuSign integration.", "Digital E-Sign Integration")
    add_bullet("Advanced predictive analytics (predicting seasonal vacancy rates and tenant churn via machine learning).", "AI Predictive Analytics")
    
    add_callout(
        "By freezing the MVP to the 9 core modules above, the intern team guarantees a robust, fully testable, and demonstrable product on time, eliminating technical debt and unpredictable third-party API dependencies.",
        title="Intern Senior-Alignment Note"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # SECTION 18: TECHNICAL TEAM એ વિચારવાના મુદ્દા
    # -------------------------------------------------------------
    add_heading_1("Point 18: Technical Architecture & Feasibility Decisions (Technical team એ વિચારવાના મુદ્દા)")
    
    p = doc.add_paragraph("Point 18 of the project brief challenges the intern team to act as software architects. Below is my comprehensive technical feasibility analysis and proposed architecture stack, detailing every technology decision, design pattern, and trade-off.")
    
    tech_stack_data = [
        ["1. Frontend Tech", "React.js (via Vite) + Tailwind CSS + Lucide Icons + TanStack Query", "High performance, instant Vite HMR, component-driven UI for complex unit grids, cached client state for snappy dashboard updates."],
        ["2. Backend Tech", "Node.js with Express.js (or NestJS) in TypeScript", "Asynchronous non-blocking I/O, native JSON handling, clean 3-tier Layered Architecture (Controller -> Service -> Data Access), industry standard."],
        ["3. Database", "PostgreSQL with Prisma ORM", "Strong ACID compliance for financial/rent records, strict foreign-key integrity between Properties, Units, Leases, and Payments. Outperforms NoSQL for relational reporting."],
        ["4. Authentication", "JWT (Access + Refresh Tokens) with HttpOnly Cookies", "Stateless, secure against XSS/CSRF when paired with HttpOnly cookies, bcrypt hashing for passwords with 12 salt rounds."],
        ["5. Role-Based Access (RBAC)", "Custom Express Authorization Middleware", "Declarative route guards e.g., authorize(['SUPER_ADMIN', 'PROPERTY_MANAGER']). Field-level permission filtering in API responses."],
        ["6. API Architecture", "Standard RESTful JSON API with Unified Envelope", "Consistent response schema: { success, data, message, meta, error }. Predictable HTTP status codes (200, 201, 400, 401, 403, 404, 500) and Zod payload validation."],
        ["7. File/Doc Storage", "Local Disk (Dev) / Cloud Object Storage AWS S3 / Supabase (Prod)", "File metadata stored in PostgreSQL ('documents' table: path, mime, size, entity_id); raw binary files stored securely in object buckets."],
        ["8. Notifications", "In-App Notification Center + Scheduled node-cron Jobs", "A scheduled cron worker runs every midnight to scan for: (1) Rent due in 5 days, (2) Overdue rent, (3) Leases expiring in 30 days, inserting into notifications table."],
        ["9. Dashboard Aggregation", "Indexed PostgreSQL Aggregate Views & Queries", "Database indices on (property_id, status, due_date). Aggregate queries (COUNT, SUM) executed via optimized SQL single-roundtrip queries to avoid N+1 issues."],
        ["10. Deployment Strategy", "Dockerized Containers on Modern Cloud (Railway / Render / Vercel)", "Multi-stage Dockerfile for backend; Vercel or Netlify for React frontend; Managed PostgreSQL instance on Neon or Supabase."],
        ["11. Security & Backup", "Helmet, CORS, Rate-Limiting & Automated pg_dump", "Defense-in-depth: Helmet headers, strict CORS, express-rate-limit against brute force, parameterized Prisma queries preventing SQL injection, daily automated backups."],
        ["12. Testing & Quality", "Jest / Vitest for Unit Tests + Supertest for API Integration", "Automated test suites verifying core business logic: Rent calculation, overdue status transitions, lease date overlap prevention, and unit occupancy status toggles."]
    ]
    create_styled_table(["Decision Dimension", "Proposed Solution", "Technical Justification"], tech_stack_data, col_widths=[1.5, 2.2, 2.8])
    
    add_heading_2("Deep-Dive: Why PostgreSQL + Prisma Beats MongoDB for Property CRM")
    add_paragraph_text = (
        "In a Property CRM, data integrity is paramount. If a unit is occupied, it MUST be tied to a valid Lease and a valid Tenant. "
        "A NoSQL database like MongoDB requires manual application-level joins and risks orphan records (e.g. payments pointing to a deleted tenant). "
        "PostgreSQL enforces database-level referential integrity, foreign key cascading rules, check constraints (e.g. rent > 0), and atomic transactions "
        "during payment logging, guaranteeing financial consistency."
    )
    p = doc.add_paragraph(add_paragraph_text)
    
    doc.add_page_break()

    # -------------------------------------------------------------
    # SECTION 19: INTERN PASSETHI EXPECTED DELIVERABLES
    # -------------------------------------------------------------
    add_heading_1("Point 19: Intern Deliverables & Concrete Implementation Specs (Interns પાસેથી Expected Deliverables)")
    
    p = doc.add_paragraph("Point 19 lists 14 specific deliverables expected from the intern team. Below is the concrete, structured response and specification for each deliverable to submit to the senior.")

    add_heading_2("1. Project Requirement Understanding Document")
    add_bullet("A multi-tenant property management platform that eliminates operational friction across multi-unit portfolios by consolidating property assets, tenant relations, lease lifecycles, payment ledgers, maintenance tickets, and financial summaries into one cohesive dashboard.", "Executive Summary")
    
    add_heading_2("2. User Roles & Permissions Matrix (RBAC Specification)")
    rbac_matrix = [
        ["Module / Action", "Super Admin", "Property Manager", "Accountant", "Maintenance Staff", "Owner (View)"],
        ["Manage Properties & Units", "Full (C/R/U/D)", "Full (C/R/U/D)", "View Only", "No Access", "View Owned Only"],
        ["Manage Tenants & Leases", "Full (C/R/U/D)", "Full (C/R/U/D)", "View Only", "No Access", "View Leases Only"],
        ["Collect Rent & Payments", "Full (C/R/U/D)", "Full (C/R/U/D)", "Full (C/R/U/D)", "No Access", "View Financials"],
        ["Maintenance Tickets", "Full (C/R/U/D)", "Create / Assign", "View Costs", "Update Assigned", "View Property Tickets"],
        ["Financial Reports & P&L", "Full Access", "Full Access", "Full Access", "No Access", "View Owned Net P&L"],
        ["System Settings & Users", "Full Access", "No Access", "No Access", "No Access", "No Access"]
    ]
    create_styled_table(rbac_matrix[0], rbac_matrix[1:], col_widths=[1.7, 0.9, 1.0, 0.9, 1.0, 1.0])

    add_heading_2("3. Complete Module Specification")
    add_bullet("Properties, Units, Owners, Tenants, Leases, Payments, Maintenance, Dashboard, Reports, Audit Logs.", "Core Inventory")
    add_bullet("Property creation -> Unit definition -> Tenant KYC onboarding -> Lease agreement binding -> Automatic rent scheduling -> Monthly payment reconciliation -> Maintenance ticket resolution.", "Operational Workflows")

    add_heading_2("4. End-to-End Workflow Diagram")
    add_callout(
        "Workflow Progression:\n"
        "[1. Create Property] ➔ [2. Generate Units (101..100)] ➔ [3. Register Tenant Profile] ➔\n"
        "[4. Execute Lease Agreement] ➔ [5. Auto-Mark Unit 'Occupied'] ➔ [6. Generate Monthly Rent Record] ➔\n"
        "[7. Record Tenant Payment (Paid)] ➔ [8. Log & Assign Maintenance Ticket] ➔ [9. View Real-time Dashboard KPIs]",
        title="Operational Lifecycle Workflow"
    )

    add_heading_2("5. Relational Database Design (Entity Relationship Architecture)")
    db_schema_data = [
        ["users", "id (PK), name, email, password_hash, role (Enum), phone, is_active, created_at"],
        ["properties", "id (PK), owner_id (FK), name, code, type, address, city, total_units, status, created_at"],
        ["units", "id (PK), property_id (FK), unit_number, floor, wing, area_sqft, base_rent, deposit, status (Enum), created_at"],
        ["tenants", "id (PK), user_id (FK optional), full_name, email, phone, id_proof_type, id_proof_number, emergency_contact, status"],
        ["leases", "id (PK), unit_id (FK), tenant_id (FK), start_date, end_date, monthly_rent, deposit_amount, rent_due_day, status, agreement_doc_url"],
        ["payments", "id (PK), lease_id (FK), unit_id (FK), tenant_id (FK), amount_due, amount_paid, payment_date, due_date, status (Paid/Pending/Overdue), payment_mode, transaction_ref"],
        ["maintenance_requests", "id (PK), unit_id (FK), tenant_id (FK), title, description, category, priority (Low/Med/High/Urgent), assigned_to (FK users), status (Open/In_Progress/Resolved/Closed), estimated_cost, actual_cost"],
        ["expenses", "id (PK), property_id (FK), category, amount, expense_date, description, receipt_url"],
        ["activity_logs", "id (PK), user_id (FK), action, entity_name, entity_id, timestamp, ip_address"]
    ]
    create_styled_table(["Table Name", "Columns, Data Types & Foreign Key Constraints"], db_schema_data, col_widths=[2.0, 4.5])

    add_heading_2("6. System Architecture Diagram")
    add_bullet("React.js SPA with Tailwind CSS, Lucide icons, responsive sidebar, filterable tables, and charts (Recharts / Chart.js).", "Client Presentation Layer")
    add_bullet("Node.js / Express REST API with JWT middleware, Zod request validation, modular controllers, and service-layer business logic.", "Application Server Layer")
    add_bullet("PostgreSQL relational engine with connection pooling, Prisma ORM, B-tree indexes on foreign keys, and daily automated backups.", "Persistence & Storage Layer")

    add_heading_2("7. UI/UX Wireframe Structure & Screen Hierarchy")
    add_bullet("Clean topbar with property switcher dropdown, search bar, and notification bell; left collapsible navigation sidebar.", "Global Layout")
    add_bullet("Summary cards (Total, Occupied, Vacant, Collection %, Open Tickets) + Occupancy Bar Chart + Recent Transactions table.", "1. Dashboard Screen")
    add_bullet("Building cards with occupancy badges, unit counter, and 'Add Property' modal.", "2. Property Portfolio Screen")
    add_bullet("Interactive 100-unit matrix/grid; color-coded badges (Green = Occupied, Blue = Vacant, Yellow = Expiring Soon, Red = Maintenance).", "3. Unit Management Grid")
    add_bullet("Full unit dossier: Current Tenant, Active Lease, Payment History ledger, Maintenance tickets, and Document attachments.", "4. Unit Detail Dossier")
    add_bullet("Filterable monthly dues table (Tenant, Unit, Due Date, Status: Paid/Overdue, 'Record Payment' button).", "5. Rent & Payment Ledger")

    add_heading_2("8. Technology Stack Recommendation & Comparison")
    add_bullet("Selected: React + Node.js + PostgreSQL + Tailwind CSS. Outperforms PHP/MySQL in dynamic client reactivity; outperforms Python/Django in frontend-backend JavaScript unification.", "Final Selection")

    add_heading_2("9. API & Module Development Plan (Sprint Roadmap)")
    sprint_data = [
        ["Sprint 1 (Weeks 1-2)", "DB Schema & Auth Foundation", "Setup PostgreSQL & Prisma. Build Users, Auth (JWT), RBAC middleware, and base layout wireframes."],
        ["Sprint 2 (Weeks 3-4)", "Properties, Units & Tenants", "CRUD APIs for Properties, Units, and Tenants. Implement unit status transitions and search/filtering."],
        ["Sprint 3 (Weeks 5-6)", "Lease, Rent & Payment Engine", "Lease creation binding, automated monthly rent dues generation, payment recording, and receipts."],
        ["Sprint 4 (Weeks 7-8)", "Maintenance Desk & Dashboard", "Maintenance ticketing pipeline, cost tracking, real-time KPI data aggregation, and charts."],
        ["Sprint 5 (Weeks 9-10)", "Reports, QA & Cloud Deployment", "Exportable reports, end-to-end integration testing, Dockerization, cloud hosting, and demo prep."]
    ]
    create_styled_table(["Sprint Phase", "Focus Milestone", "Concrete Deliverables"], sprint_data, col_widths=[1.5, 2.0, 3.0])

    add_heading_2("10. MVP Development Codebase")
    add_bullet("Clean Git repository with feature-branch workflow (`main`, `develop`, `feature/*`), structured folders (`/frontend`, `/backend`, `/prisma`, `/docs`), and detailed README.md.", "Repository Hygiene")

    add_heading_2("11. Testing & Quality Assurance Plan")
    add_bullet("Unit tests for rent calculation, payment ledger balance updates, and lease date overlap prevention.", "Automated Unit Tests")
    add_bullet("Integration tests verifying complete workflows: creating a property -> adding unit -> leasing to tenant -> recording payment -> resolving maintenance.", "End-to-End API Tests")

    add_heading_2("12. Final Product Demo Script")
    add_bullet("A crisp 10-minute senior walk-through demonstrating a 100-unit property scenario, finding overdue tenants in 2 clicks, and showing instant dashboard KPI updates.", "Demo Script")

    add_heading_2("13. College / Senior Presentation Deck Structure")
    add_bullet("Fully scripted 16-slide slide deck covering business value, architecture, live demo, and tech decisions (detailed in Point 21).", "Presentation Deck")

    add_heading_2("14. Future Scope & Improvement Roadmap")
    add_bullet("Documented Phase 2 and Phase 3 roadmap (Mobile apps, payment gateway integration, WhatsApp reminders, AI occupancy forecasting).", "Future Roadmap")

    doc.add_page_break()

    # -------------------------------------------------------------
    # SECTION 20: PRESENTATION QUESTIONS & ANSWERS
    # -------------------------------------------------------------
    add_heading_1("Point 20: Presentation Mastery – Intern Q&A Guide (Presentationમાં Internsએ શું સમજાવવું?)")
    
    p = doc.add_paragraph("During project review or senior evaluation, the intern will be asked deep conceptual questions. Below are the definitive, expert-level answers to all 12 key presentation points.")

    qa_list = [
        ("1. Problem શું છે? (What is the core problem?)",
         "Property managers who oversee multiple buildings or 100+ units struggle with data fragmentation. Rent records are in Excel, tenant documents are in physical files, maintenance complaints arrive via WhatsApp, and agreement renewals are forgotten. This causes financial loss, delayed rent collection, unaddressed tenant repairs, and zero executive visibility."),
        
        ("2. Traditional property managementમાં શું મુશ્કેલી છે? (Bottlenecks of traditional management)",
         "Manual workflows fail at scale. An Excel sheet cannot alert you that Unit 204's lease expires next week. It cannot prevent double-booking a vacant unit. It cannot cross-link a maintenance plumbing bill to property expenses automatically. Paper registers lack audit trails, search capabilities, and multi-user access control."),
        
        ("3. આ CRM શા માટે જરૂરી છે? (Why is this CRM essential?)",
         "It acts as a single source of truth. It consolidates Property, Unit, Tenant, Lease, Rent, Maintenance, and Financials into one centralized platform, reducing administrative overhead by 70%, guaranteeing zero missed rent payments, and giving managers real-time control."),
        
        ("4. Systemના મુખ્ય users કોણ છે? (Who are the primary system users?)",
         "Super Admin (complete platform oversight), Property Manager (day-to-day properties, units, tenants, leases, operations), Accountant / Finance User (rent ledgers, dues, payments, expense records), Maintenance Staff (ticket execution and repair updates), Owner (view-only financial reports of their owned properties), and Tenant (view lease and requests)."),
         
        ("5. Property અને Unit કેવી રીતે manage થશે? (How are Properties & Units managed?)",
         "Through a parent-child relational hierarchy: One Property has many Units. Each unit maintains an atomic state machine: VACANT ➔ RESERVED ➔ OCCUPIED ➔ UNDER_MAINTENANCE. A unit cannot be leased unless it is in VACANT status. Managers can view a visual 100-unit grid with instant occupancy filters."),
         
        ("6. Tenant અને Agreement કેવી રીતે જોડાશે? (How are Tenants & Leases linked?)",
         "A Tenant profile is created with KYC info. A Lease Agreement entity acts as the operational bridge between a Unit and a Tenant, capturing Start/End dates, monthly rent, security deposit, and payment due day. When a lease is activated, the unit's status automatically toggles to 'OCCUPIED'."),
         
        ("7. Rent અને Payment કેવી રીતે track થશે? (How are Rent & Payments tracked?)",
         "The system generates a monthly payment schedule based on the lease terms. Each month creates a Payment record with status: PENDING. When payment is logged, it transitions to PAID with payment mode and receipt reference. If the due date passes without payment, background logic flags the status as OVERDUE, triggering alerts."),
         
        ("8. Maintenance કેવી રીતે manage થશે? (How is Maintenance managed?)",
         "Tickets are created against a specific Unit with Category (Plumbing, Electrical, etc.) and Priority (Low, Medium, High, Urgent). The manager assigns the ticket to maintenance staff. The ticket transitions: OPEN ➔ IN_PROGRESS ➔ RESOLVED ➔ CLOSED. Repair costs are logged and feed directly into the property's expense reports."),
         
        ("9. Dashboard શું બતાવશે? (What does the Dashboard reveal in 15 seconds?)",
         "At a single glance: (1) Total Units & Occupancy Rate %, (2) Total Rent Collected this month vs Pending vs Overdue, (3) Count of Open & Urgent Maintenance tickets, (4) Agreements expiring in the next 30 days, and (5) Visual occupancy charts and recent payment activity feed."),
         
        ("10. Databaseમાં મુખ્ય entities કેવી છે? (What are the core database entities?)",
         "A normalized relational model in PostgreSQL: Users (authentication & roles), Properties (buildings/assets), Units (individual flats/shops), Tenants (renters), Leases (contracts binding units to tenants), Payments (financial transactions), MaintenanceRequests (tickets), Expenses (operational costs), and ActivityLogs (audit trail)."),
         
        ("11. Security અને roles કેવી રીતે કામ કરશે? (How do Security & Permissions work?)",
         "Stateless JWT authentication stored in HttpOnly cookies, bcrypt password hashing, declarative RBAC middleware enforcing endpoint authorization, tenant data isolation, soft-deletes for critical entities to prevent accidental data loss, and immutable activity logging for auditability."),
         
        ("12. MVPમાં શું બનાવ્યું અને Futureમાં શું ઉમેરાઈ શકે? (MVP vs Future Scope)",
         "In the MVP, we engineered 100% functional core operations: Property/Unit inventory, Tenant onboarding, Lease agreements, Rent tracking, Maintenance ticketing, and Executive Dashboard. In Future phases, we will add Tenant/Owner mobile apps, automated WhatsApp notifications, online payment gateways, and AI rent forecasting.")
    ]
    
    for q_title, q_ans in qa_list:
        add_heading_2(q_title)
        p = doc.add_paragraph(q_ans)
        p.paragraph_format.space_after = Pt(4)

    doc.add_page_break()

    # -------------------------------------------------------------
    # SECTION 21: SUGGESTED PRESENTATION FLOW (SLIDES 1 TO 16)
    # -------------------------------------------------------------
    add_heading_1("Point 21: Presentation Slide-by-Slide Script (Slides 1 to 16)")
    
    p = doc.add_paragraph("Point 21 outlines the suggested 16-slide presentation flow. Below is the complete content, visual recommendation, speaker notes, and key takeaways for every single slide.")

    slides_data = [
        ["Slide 1", "Title & Introduction", "Project Logo, Subtitle: Next-Gen Property Management CRM, Presenter Names & Roles.", "Introduce the project as a comprehensive operational solution for modern real estate portfolios, designed to replace fragmented legacy methods."],
        ["Slide 2", "The Real-World Problem", "Visual split: Chaotic messy spreadsheets + missed WhatsApp messages vs Lost Revenue.", "Highlight how manual registers and Excel lead to uncollected rent, untracked repairs, and chaotic records when managing 100+ units."],
        ["Slide 3", "Proposed Solution", "Central CRM Hub diagram connecting Properties, Tenants, Finance, and Maintenance.", "Explain the vision: A unified web platform giving managers 360-degree visibility and complete operational control in real time."],
        ["Slide 4", "Target Users & Personas", "Icons for Super Admin, Property Manager, Accountant, Maintenance Staff, Owner.", "Detail user roles, their responsibilities, and how RBAC provides tailored views while protecting sensitive financial data."],
        ["Slide 5", "System Architecture & High-Level Flow", "3-Tier architectural diagram: React UI ➔ Express REST API ➔ PostgreSQL Database.", "Walk through the clean separation of concerns, scalability from 10 to 1,000+ units, and reliable data contracts."],
        ["Slide 6", "Property & Unit Hierarchy", "Tree diagram: Property (Sunrise Residency) ➔ 100 Units with color-coded status badges.", "Demonstrate how multi-unit buildings are managed, unit state transitions (Vacant to Occupied), and fast filtering."],
        ["Slide 7", "Tenant & Lease Management", "Lease agreement lifecycle diagram linking Tenant KYC to Unit with date terms.", "Explain how agreements bind tenants to units, track security deposits, and establish automated rent schedules."],
        ["Slide 8", "Rent & Payment Tracking Ledger", "Mock screenshot of the payment ledger: Paid, Pending, and Overdue badges.", "Showcase how monthly dues are tracked, partial/full payment recording, and automated overdue identification."],
        ["Slide 9", "Maintenance Ticket Desk", "Kanban/Pipeline visual: Open ➔ In Progress ➔ Resolved ➔ Closed with priority tags.", "Explain how tenant repair complaints are logged, assigned to technicians, tracked for costs, and closed transparently."],
        ["Slide 10", "Executive Dashboard & Reports", "Screenshot of the 15-second KPI dashboard: Occupancy %, Revenue cards, Alerts.", "Present the command center where managers make decisions in seconds based on live financial and operational data."],
        ["Slide 11", "Database Architecture & ER Diagram", "Clean ER Diagram showing tables, primary keys, and foreign key relations.", "Explain the relational schema, data integrity constraints, indexing strategy, and why PostgreSQL was chosen."],
        ["Slide 12", "Security, RBAC & Data Integrity", "Security shield graphic: JWT, Bcrypt, Middleware guards, Soft-deletes.", "Reassure evaluators of enterprise security: strict authentication, permission middleware, and audit logs."],
        ["Slide 13", "Technology Stack Justification", "Logos of React, Vite, Node.js, Express, PostgreSQL, Prisma, Tailwind CSS.", "Defend stack decisions: performance, maintainability, type-safety, and developer productivity."],
        ["Slide 14", "Live MVP Demonstration", "Live product demo walkthrough: Adding unit, leasing, paying rent, viewing dashboard.", "Perform the end-to-end 10-minute demo, highlighting real-time updates and seamless usability."],
        ["Slide 15", "Future Roadmap (Phases 2 & 3)", "Roadmap timeline: Mobile App, Payment Gateway, WhatsApp API, AI Analytics.", "Show ambition and vision: how the MVP evolves into an enterprise-grade SaaS platform."],
        ["Slide 16", "Conclusion & Key Takeaways", "Summary checkmarks: Centralized, Scalable, Production-Ready + Q&A invitation.", "Summarize achievements, express gratitude to mentors/seniors, and open the floor for questions."]
    ]
    
    create_styled_table(["Slide #", "Slide Topic", "Recommended Visual Content", "Presenter Speaking Script & Key Takeaway"], slides_data, col_widths=[0.8, 1.5, 2.0, 2.2])

    doc.add_page_break()

    # -------------------------------------------------------------
    # SECTION 22 TO 25: SUCCESS CRITERIA, VISION & ROADMAP
    # -------------------------------------------------------------
    add_heading_1("Points 22, 23, 24 & 25: Success Criteria, Vision & Intern Execution Roadmap")

    add_heading_2("Point 22: Project Success Criteria (How to Validate Success)")
    p = doc.add_paragraph("The success of this CRM project is measured by rigorous functional and operational benchmarks rather than mere visual appearance. The intern team will validate success against the following criteria:")

    success_data = [
        ["1. Data Centralization", "100% of property, unit, tenant, lease, payment, and maintenance data lives in a single database—zero reliance on spreadsheets."],
        ["2. Relational Integrity", "All foreign key relations work seamlessly without orphaned data. Deleting or archiving a unit or tenant maintains data consistency."],
        ["3. End-to-End Workflows", "A complete workflow from property onboarding to unit lease, rent payment, maintenance resolution, and reporting executes without errors."],
        ["4. 15-Second Dashboard", "The dashboard loads in < 1.5 seconds and conveys total occupancy, monthly collection, dues, and urgent tickets within 15 seconds."],
        ["5. Practical Search & Filters", "Searching a 100-unit building by tenant name, unit number, or payment status yields instant results."],
        ["6. Role-Based Access Control", "Accountants cannot edit property info; maintenance staff cannot view financial ledgers; unauthorized access is blocked with 403."],
        ["7. Real-World Demo Quality", "The live demo effortlessly simulates a 100-unit property with realistic multi-unit data and edge cases (vacancies, late payments)."]
    ]
    create_styled_table(["Success Benchmark", "Verification & Operational Requirement"], success_data, col_widths=[2.2, 4.3])

    add_heading_2("Point 23: Final Project Vision (From 10 Units to Enterprise Scale)")
    p = doc.add_paragraph(
        "The ultimate vision of this Property Management CRM extends far beyond basic data entry. It is designed as a foundational SaaS engine "
        "capable of providing complete operational command to property owners and management agencies. Whether managing a single 10-unit residential "
        "apartment, a 100-unit mixed commercial complex, or a distributed portfolio of thousands of units across multiple cities, the architecture "
        "is engineered for horizontal scalability, multi-tenancy, and seamless operational automation."
    )

    add_heading_2("Point 24: One-Line Project Summary (The Elevator Pitch)")
    add_callout(
        "English: \"A unified, high-performance web CRM that centralizes Properties, Units, Tenants, Leases, Payments, Maintenance, and Real-Time Analytics into a single operational cockpit.\"\n\n"
        "ગુજરાતી: \"એક જ પ્લેટફોર્મ પરથી Properties, Units, Tenants, Agreements, Rent, Payments, Maintenance અને Reportsનું સંપૂર્ણ અને સરળ સંચાલન.\"",
        title="Official Project Elevator Pitch"
    )

    add_heading_2("Point 25: Important Engineering Note & Execution Sequence for Interns")
    p = doc.add_paragraph("Senior engineers prioritize method over speed. Point 25 provides the golden engineering rules and sequential execution path for the intern team:")
    
    add_bullet("Never start coding UI before locking the database schema and API contracts. Scope changes late in development waste 5x more time.", "Rule 1: Never Code Blindly")
    add_bullet("If a business rule is ambiguous (e.g. 'How should partial rent payments behave?'), document options and get clarification from the senior/lead immediately rather than making risky assumptions.", "Rule 2: Clarify Assumptions Immediately")
    add_bullet("Strictly follow the 7-step engineering development sequence below:", "Rule 3: Follow the Sequential Lifecycle")

    sequence_data = [
        ["Step 1", "Scope Freeze", "Lock MVP boundary (Point 16) and sign off with senior."],
        ["Step 2", "UI/UX & Wireframes", "Design screen hierarchy and confirm user flow for 100-unit scenario."],
        ["Step 3", "Database Architecture", "Draft PostgreSQL ER schema, constraints, indexes, and write Prisma migrations."],
        ["Step 4", "Backend API Engine", "Implement Express controllers, services, JWT auth, and RBAC middleware."],
        ["Step 5", "Frontend Implementation", "Build React UI components, integrate TanStack Query, and wire up live API endpoints."],
        ["Step 6", "QA & Edge Case Testing", "Test financial calculations, status transitions, invalid inputs, and error handlers."],
        ["Step 7", "Deployment & Demo Prep", "Deploy on cloud, populate 100-unit realistic seed data, and rehearse 16-slide presentation."]
    ]
    create_styled_table(["Step", "Milestone", "Actionable Intern Objective"], sequence_data, col_widths=[1.0, 1.8, 3.7])

    add_callout(
        "By adhering to this structured document, the intern demonstrates senior-level maturity, solid engineering rigor, "
        "and clear strategic vision. This document is fully structured to serve as both an operational development guide "
        "and an executive presentation dossier.",
        title="Final Readiness Endorsement"
    )

    # Save Document
    output_filename = "Property_Management_CRM_Intern_Project_Plan_and_Solution.docx"
    doc.save(output_filename)
    print(f"Document successfully created and saved as '{output_filename}'")

if __name__ == "__main__":
    create_document()
