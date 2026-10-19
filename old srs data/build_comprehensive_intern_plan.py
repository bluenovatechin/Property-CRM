import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def generate_intern_solution_document():
    doc = docx.Document()
    
    # Page setup - 1 inch margins all around
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)
        
    # Color Palette Constants (Professional Navy, Cerulean, Slate, Charcoal)
    HEX_PRIMARY = "1E3A8A"      # Deep Navy Blue
    HEX_SECONDARY = "0284C7"    # Sky / Cerulean Blue
    HEX_DARK = "0F172A"         # Slate 900
    HEX_MUTED = "475569"        # Slate 600
    HEX_BG_LIGHT = "F8FAFC"     # Slate 50
    HEX_BG_BOX = "F1F5F9"       # Slate 100
    HEX_BORDER = "CBD5E1"       # Slate 300
    HEX_BORDER_DARK = "94A3B8"  # Slate 400
    
    COLOR_PRIMARY = RGBColor(0x1E, 0x3A, 0x8A)
    COLOR_SECONDARY = RGBColor(0x02, 0x84, 0xC7)
    COLOR_DARK = RGBColor(0x0F, 0x17, 0x2A)
    COLOR_MUTED = RGBColor(0x47, 0x55, 0x69)
    COLOR_WHITE = RGBColor(0xFF, 0xFF, 0xFF)
    
    # Configure Normal Style
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Calibri'
    style_normal.font.size = Pt(10.5)
    style_normal.font.color.rgb = COLOR_DARK
    style_normal.paragraph_format.line_spacing = 1.15
    style_normal.paragraph_format.space_after = Pt(4)
    
    # XML Helpers
    def set_cell_background(cell, hex_color):
        shading_xml = f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>'
        cell._tc.get_or_add_tcPr().append(parse_xml(shading_xml))
        
    def set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = OxmlElement('w:tcMar')
        for margin_name, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
            node = OxmlElement(margin_name)
            node.set(qn('w:w'), str(val))
            node.set(qn('w:type'), 'dxa')
            tcMar.append(node)
        tcPr.append(tcMar)

    def set_cell_border(cell, **kwargs):
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

    def add_diagram_box(ascii_diagram_text, caption=None):
        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        cell = table.rows[0].cells[0]
        cell.width = Inches(6.5)
        set_cell_background(cell, "0F172A") # Dark Slate / Terminal background
        set_cell_margins(cell, top=140, bottom=140, left=180, right=180)
        set_cell_border(cell, 
                        top=dict(sz=6, val='single', color="334155"),
                        bottom=dict(sz=6, val='single', color="334155"),
                        left=dict(sz=18, val='single', color="0284C7"),
                        right=dict(sz=6, val='single', color="334155"))
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.05
        run = p.add_run(ascii_diagram_text)
        run.font.name = 'Consolas'
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x38, 0xBD, 0xF8) # Sky blue terminal font
        
        if caption:
            p_cap = doc.add_paragraph()
            p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_cap.paragraph_format.space_before = Pt(2)
            p_cap.paragraph_format.space_after = Pt(6)
            run_cap = p_cap.add_run(f"Diagram: {caption}")
            run_cap.italic = True
            run_cap.font.name = 'Calibri'
            run_cap.font.size = Pt(9)
            run_cap.font.color.rgb = COLOR_MUTED
        else:
            doc.add_paragraph().paragraph_format.space_after = Pt(4)

    def add_heading_1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(16)
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
        p.paragraph_format.space_before = Pt(12)
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
        p.paragraph_format.space_before = Pt(8)
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
            run.font.color.rgb = COLOR_WHITE
            
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

    # =========================================================================
    # DOCUMENT COVER / TITLE BLOCK
    # =========================================================================
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(12)
    p_title.paragraph_format.space_after = Pt(2)
    run_main_title = p_title.add_run("PROPERTY MANAGEMENT CRM")
    run_main_title.bold = True
    run_main_title.font.name = 'Calibri'
    run_main_title.font.size = Pt(26)
    run_main_title.font.color.rgb = COLOR_PRIMARY
    
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_after = Pt(12)
    run_sub = p_sub.add_run("System Architecture, ER Design, Process Flows & Intern Execution Blueprint\n(Solving Project Points 16, 18, 19, 20, 21, 22, 23, 24 & 25)")
    run_sub.font.name = 'Calibri'
    run_sub.font.size = Pt(12)
    run_sub.font.color.rgb = COLOR_SECONDARY
    
    meta_table_data = [
        ["Document Purpose", "Forward-Looking Engineering Blueprint & Comprehensive Intern Implementation Proposal"],
        ["Target Audience", "Senior Technical Lead, Project Mentors, Evaluators, and Intern Developer"],
        ["Domain", "Real Estate SaaS / Multi-Unit Commercial & Residential Property Management"],
        ["Implementation Phase", "Pre-Development Architecture, Scope Locking & Engineering Roadmap (v2.0 Action Plan)"],
        ["Author / Role", "Intern Software Engineer (Full Stack Architecture & Development)"]
    ]
    create_styled_table(["Metadata Attribute", "Project Plan Specification"], meta_table_data, col_widths=[2.2, 4.3])

    # =========================================================================
    # SECTION 0: INTERN CONCEPTUAL GROUNDING
    # =========================================================================
    add_heading_1("Executive Summary: What I Learned from the Brief & My Execution Strategy")
    
    add_callout(
        "\"This document outlines exactly WHAT WE ARE GOING TO BUILD and HOW WE WILL EXECUTE IT in the upcoming days. "
        "It provides a complete, professional technical roadmap for taking the Property Management CRM from a business "
        "concept into a robust, high-performance web platform. I have structured this proposal so that my senior lead can "
        "easily review the architecture, ER models, data flows, and project milestones prior to code implementation.\"",
        title="Intern Engineering Mission Statement"
    )
    
    add_heading_2("1. What I Learned Through Reading the Entire Project Brief")
    add_bullet("Small to medium property managers currently manage 100+ units using disconnected tools: Excel sheets, physical paper registers, and WhatsApp chats. When units scale, this fragmented workflow leads to severe operational failure: missed rent collections, untracked tenant security deposits, forgotten lease expirations, and unaddressed maintenance complaints.", "The Fundamental Business Problem")
    add_bullet("A Property Management CRM is not a generic CRUD data-entry app. It is a tightly-coupled relational domain where every action triggers cascading effects: assigning a tenant automatically changes unit availability to 'Occupied', generates a binding lease, triggers a monthly recurring rent schedule, and opens an operational ledger.", "The Relational Interconnection")
    add_bullet("A property manager must be able to open the dashboard and understand the exact financial and physical health of 100 units within 10 to 15 seconds: Total Occupancy %, Pending Dues, Overdue Tenants, and Urgent Maintenance tickets.", "The 15-Second Dashboard Rule")
    add_bullet("The primary danger for intern projects is attempting too much at once (scope creep). As an intern, my strategy is to first lock the core Minimum Viable Product (MVP), prove the complete end-to-end operational flow, and defer complex third-party APIs (WhatsApp gateways, payment gateways) to Phase 2.", "Engineering Discipline (Scope Lock)")

    add_heading_2("2. What My Proposed Action Plan Is (To Present to My Senior)")
    add_bullet("Deliver a pristine, fully working MVP containing the 9 core modules (Auth, Properties, Units, Tenants, Leases, Payments, Maintenance, Dashboard, Basic Reports).", "Step 1: MVP Scope Lock (Point 16)")
    add_bullet("Adopt a rock-solid, enterprise-grade modern tech stack: React.js (Vite) + Node.js/Express (TypeScript) + PostgreSQL + Prisma ORM with clear architectural justifications.", "Step 2: Technical Architecture Decisions (Point 18)")
    add_bullet("Produce all 14 concrete engineering deliverables including complete ER diagrams, RBAC security matrices, detailed REST API route specs, ASCII system flows, wireframes, and test plans.", "Step 3: Deliverables Execution (Point 19)")
    add_bullet("Confidently answer all 12 senior evaluation questions and present an engaging 16-slide walkthrough.", "Step 4: Presentation & Evaluation Mastery (Points 20 & 21)")
    add_bullet("Follow a strict 7-stage sequential engineering lifecycle: Scope Lock -> Wireframes -> DB Schema -> APIs -> Frontend -> QA -> Deployment.", "Step 5: Sequential Execution (Point 25)")

    doc.add_page_break()

    # =========================================================================
    # SECTION 16: MVP PRATHAM VERSION MASHU BANAVU
    # =========================================================================
    add_heading_1("Point 16: MVP Scope Lock – પ્રથમ Versionમાં શું બનાવવું?")
    
    p = doc.add_paragraph(
        "To ensure high engineering quality and prevent deadline failure, we are establishing a strict boundary "
        "between Phase 1 (Core Working MVP) and Phase 2 (Future Scope). In the upcoming days, our development "
        "focus will be 100% committed to completing the 9 core functional modules below."
    )
    
    add_heading_2("16.1 Phase 1 (MVP) – Modules We Are Going to Build")
    
    mvp_table = [
        ["1. Authentication & RBAC", "Implement secure user registration/login with JWT and bcrypt. Establish 4 primary roles: Super Admin, Property Manager, Accountant, and Maintenance Staff with declarative route protection."],
        ["2. Property Management", "Create, edit, view, and archive properties (Residential, Commercial, Mixed). Store property code, full address, total units count, and owner associations."],
        ["3. Unit Management", "Manage multi-unit portfolios (e.g. Unit 101 to 200). Record flat/shop number, floor, wing, square footage, expected rent, security deposit, and atomic status ('Vacant', 'Occupied', 'Reserved', 'Maintenance')."],
        ["4. Tenant Management", "Maintain tenant profiles with full contact details, emergency contact, government ID proof (Aadhaar/PAN/Passport), active status, and linked property/unit dossier."],
        ["5. Lease / Agreement", "Engine that binds a Tenant to a Unit. Records start date, end date, agreed monthly rent, security deposit collected, and rent due day of each month."],
        ["6. Rent & Payment Tracker", "Generate monthly recurring rent records. Track status ('Paid', 'Pending', 'Overdue'). Log payments with date, amount, payment mode (Cash, UPI, Cheque, Bank Transfer), and generate receipt numbers."],
        ["7. Maintenance Desk", "Ticketing system for unit repair complaints. Record issue category, description, priority ('Low', 'Medium', 'High', 'Urgent'), assigned technician, repair costs, and ticket status."],
        ["8. Executive Dashboard", "The manager's command center: Real-time KPI summary cards (Occupancy %, Collected Rent, Pending Dues, Overdue Count, Open Tickets) + visual occupancy breakdown."],
        ["9. Basic Operational Reports", "Exportable and filterable data tables: Unit Occupancy Report, Monthly Rent Defaulters/Overdue Report, Leases Expiring in 30 Days, and Maintenance Cost Summary."]
    ]
    create_styled_table(["Core MVP Module", "Detailed Scope of What We Will Build"], mvp_table, col_widths=[2.0, 4.5])

    add_heading_2("16.2 Phase 2 – Features We Are Strictly Deferring")
    add_bullet("We will not integrate Razorpay or Stripe in Phase 1. Managers will record payments manually (Cash/UPI reference) to avoid payment webhook security overhead during prototype testing.", "Online Payment Gateway")
    add_bullet("We will not build native iOS/Android mobile apps initially. The web application will be fully responsive for mobile browsers.", "Tenant & Owner Mobile Apps")
    add_bullet("Automated SMS or WhatsApp Cloud API messaging will be deferred to Phase 2 to prevent third-party gateway costs and subscription roadblocks.", "WhatsApp / SMS Auto-Dispatch")
    add_bullet("Digital e-signature APIs (Aadhaar e-Sign, DocuSign) will be deferred. Managers will upload scanned PDF agreements in the MVP.", "Digital E-Sign Integration")
    add_bullet("Machine learning models for predicting future vacancy rates or rent price trends will be added only after accumulating real operational data.", "AI Predictive Analytics")

    add_callout(
        "By locking this MVP scope, we guarantee that the intern team will deliver a 100% bug-free, fully testable, "
        "and demonstrable product that satisfies all core business requirements without getting derailed by third-party APIs.",
        title="Strategic Scope-Lock Rule"
    )

    doc.add_page_break()

    # =========================================================================
    # SECTION 18: TECHNICAL TEAM એ વિચારવાના મુદ્દા
    # =========================================================================
    add_heading_1("Point 18: Technical Architecture & Feasibility Decisions (Technical team એ વિચારવાના મુદ્દા)")
    
    p = doc.add_paragraph(
        "Point 18 of the brief requires the intern team to act as software architects. Below is our comprehensive "
        "technical feasibility blueprint answering all 12 architectural dimensions with concrete technical selections and justifications."
    )
    
    tech_table = [
        ["1. Frontend Tech", "React 18+ (Vite) + Tailwind CSS + Lucide Icons + TanStack Query", "High performance, instant Vite HMR, component-driven UI for rendering complex 100-unit grids, responsive utility-first CSS, and robust server-state caching."],
        ["2. Backend Tech", "Node.js (v20+) with Express.js in TypeScript", "Asynchronous non-blocking I/O, native JSON handling, TypeScript type safety across models and DTOs, and a clean 3-tier Layered Architecture (Controller -> Service -> Data Access)."],
        ["3. Database", "PostgreSQL (v16+) with Prisma ORM", "ACID compliance for financial transactions, strict foreign-key integrity between properties, units, leases, and payments. Outperforms NoSQL for relational reporting."],
        ["4. Authentication", "JWT (Access + Refresh Tokens) with HttpOnly Cookies", "Stateless session management, resilient against XSS/CSRF when using HttpOnly, SameSite=Strict cookies; bcrypt password hashing with 12 salt rounds."],
        ["5. Role-Based Access (RBAC)", "Custom Express Authorization Middleware", "Declarative route guards e.g., authorize(['SUPER_ADMIN', 'PROPERTY_MANAGER']). Field-level permission filtering in API responses."],
        ["6. API Architecture", "RESTful JSON API with Unified Envelope Pattern", "Standard response envelope: { success, data, message, meta, error }. Predictable HTTP status codes (200, 201, 400, 401, 403, 404, 500) and Zod payload validation."],
        ["7. File Storage", "Local Disk (Dev) / Cloud Object Storage AWS S3 / Supabase (Prod)", "File metadata recorded in PostgreSQL ('documents' table); raw binary files stored securely in object buckets with signed URLs."],
        ["8. Notifications", "In-App Notification Center + node-cron Scheduled Worker", "A scheduled cron worker runs every midnight to scan for: (1) Rent due in 5 days, (2) Overdue rent, (3) Leases expiring in 30 days, creating in-app alerts."],
        ["9. Dashboard Aggregation", "Indexed PostgreSQL Aggregate Views & Queries", "Database indices on (property_id, status, due_date). Aggregate queries (COUNT, SUM) executed via optimized SQL single-roundtrip queries to avoid N+1 issues."],
        ["10. Deployment Strategy", "Dockerized Containers on Modern Cloud (Railway / Render / Vercel)", "Multi-stage Dockerfile for backend; Vercel or Netlify for React frontend; Managed PostgreSQL instance on Neon or Supabase."],
        ["11. Security & Backup", "Helmet, CORS, Rate-Limiting & Automated pg_dump", "Defense-in-depth: Helmet headers, strict CORS, express-rate-limit against brute force, parameterized Prisma queries preventing SQL injection, daily automated backups."],
        ["12. Testing & Quality", "Jest / Vitest for Unit Tests + Supertest for API Integration", "Automated test suites verifying core business logic: Rent calculation, overdue status transitions, lease date overlap prevention, and unit occupancy status toggles."]
    ]
    create_styled_table(["Architectural Dimension", "Proposed Solution / Tech Choice", "Technical Feasibility & Justification"], tech_table, col_widths=[1.5, 2.2, 2.8])

    add_heading_2("Deep-Dive: Why We Are Choosing PostgreSQL Over MongoDB")
    p = doc.add_paragraph(
        "A critical question for the technical team is database selection. We have specifically chosen PostgreSQL over MongoDB because of the following structural realities:"
    )
    add_bullet("In a Property CRM, relationships are non-negotiable. If a unit is leased, it MUST reference an active Lease and an existing Tenant. PostgreSQL enforces referential integrity at the engine level with foreign keys (`ON DELETE RESTRICT` or `CASCADE`), preventing orphaned financial or unit records.", "1. Strict Referential Integrity")
    add_bullet("Logging a rent payment involves updating multiple tables simultaneously: creating a `Payment` record, updating the `Lease` balance, marking the rent status as 'PAID', and updating the unit ledger. PostgreSQL guarantees atomic ACID transactions—if any query fails, the entire transaction rolls back.", "2. ACID Transactions for Financial Ledgers")
    add_bullet("The executive dashboard and monthly financial reports require aggregating data across Properties, Units, Leases, and Payments. SQL handles multi-table `JOIN` operations and indexed aggregations (`SUM`, `COUNT`) with high efficiency compared to MongoDB's complex and slower aggregation pipelines.", "3. Complex Reporting Aggregations")

    doc.add_page_break()

    # =========================================================================
    # SECTION 19: INTERN PASSETHI EXPECTED DELIVERABLES
    # =========================================================================
    add_heading_1("Point 19: Intern Deliverables & Concrete Implementation Specs (Interns પાસેથી Expected Deliverables)")
    
    p = doc.add_paragraph(
        "Point 19 lists 14 specific deliverables expected from the intern team. Below is our comprehensive, "
        "concrete technical blueprint detailing exactly how we will produce each deliverable."
    )

    # Deliverable 1
    add_heading_2("Deliverable 1: Project Requirement Understanding Document")
    add_bullet("A multi-tenant property management platform that eliminates operational friction across multi-unit portfolios by consolidating property assets, tenant relations, lease lifecycles, payment ledgers, maintenance tickets, and financial summaries into one cohesive dashboard.", "Executive Summary")
    add_bullet("Replaces error-prone manual spreadsheets with a central, automated system providing real-time data visibility to property managers.", "Core Purpose")

    # Deliverable 2
    add_heading_2("Deliverable 2: User Roles & Permissions Matrix (RBAC Specification)")
    rbac_table_data = [
        ["Module / Operation", "Super Admin", "Property Manager", "Accountant", "Maintenance Staff", "Owner (View)"],
        ["Properties & Units", "Full (C/R/U/D)", "Full (C/R/U/D)", "View Only", "No Access", "View Owned Only"],
        ["Tenants & Leases", "Full (C/R/U/D)", "Full (C/R/U/D)", "View Only", "No Access", "View Leases Only"],
        ["Rent & Payments", "Full (C/R/U/D)", "Full (C/R/U/D)", "Full (C/R/U/D)", "No Access", "View Financials"],
        ["Maintenance Tickets", "Full (C/R/U/D)", "Create / Assign", "View Costs", "Update Assigned", "View Property Tickets"],
        ["Expenses & P&L", "Full Access", "Full Access", "Full Access", "No Access", "View Owned Net P&L"],
        ["User Administration", "Full Access", "No Access", "No Access", "No Access", "No Access"]
    ]
    create_styled_table(rbac_table_data[0], rbac_table_data[1:], col_widths=[1.7, 0.9, 1.0, 0.9, 1.0, 1.0])

    # Deliverable 3
    add_heading_2("Deliverable 3: Complete Module Specification")
    add_bullet("Properties, Units, Owners, Tenants, Leases, Payments, Maintenance Desk, Expenses, Dashboard, Reports, Audit Logs.", "Core Inventory")
    add_bullet("Property creation -> Unit definition -> Tenant KYC onboarding -> Lease agreement binding -> Automatic rent scheduling -> Monthly payment reconciliation -> Maintenance ticket resolution.", "Operational Workflows")

    # Deliverable 4: Workflow Diagram
    add_heading_2("Deliverable 4: End-to-End Operational Workflow Diagrams")
    p = doc.add_paragraph("Below are the precise lifecycle process flows we will implement in the system:")

    diag_workflow = """========================================================================================
                      END-TO-END OPERATIONAL LIFECYCLE FLOW
========================================================================================

 [1. PROPERTY & UNIT CREATION]
        │
        ▼
   Property Manager registers Property (e.g., 'Sunrise Residency')
        │
        ▼
   System generates Unit Inventory (Unit 101 to Unit 200)
   (Initial Status: VACANT | Set Expected Rent & Deposit)
        │
        ▼
 [2. TENANT ONBOARDING & LEASE EXECUTION]
        │
        ▼
   Manager inputs Tenant KYC (Name, Phone, Aadhaar/ID, Emergency Contact)
        │
        ▼
   Manager executes Lease Agreement:
   (Unit: 101 + Tenant: Customer A + Start/End Dates + Monthly Rent + Due Day)
        │
        ├──▶ Unit Status automatically transitions from 'VACANT' ──▶ 'OCCUPIED'
        │
        ▼
 [3. RENT GENERATION & PAYMENT RECONCILIATION]
        │
        ▼
   On 1st of every month: System automatically creates Payment Record (Status: PENDING)
        │
        ├──▶ IF Paid before due date:
        │       Manager records payment ──▶ Status updates to 'PAID' (Receipt Generated)
        │
        └──▶ IF Due date passes unpaid:
                Cron worker alerts ───────▶ Status updates to 'OVERDUE' (Dashboard Alert)
        │
        ▼
 [4. MAINTENANCE TICKET PIPELINE]
        │
        ▼
   Tenant complains / Manager logs issue (e.g., 'Unit 102 Plumbing Leak')
        │
        ▼
   Ticket logged (Priority: High) ──▶ Assigned to Staff ──▶ Status: IN_PROGRESS
        │
        ▼
   Staff completes repair ──▶ Actual Cost Recorded ──▶ Status: RESOLVED ──▶ CLOSED
   (Repair cost feeds directly into Property Expense Ledger)
        │
        ▼
 [5. REAL-TIME DASHBOARD AGGREGATION]
        │
        ▼
   Manager logs into Dashboard:
   Instant 15-second view: Total Occupied %, Collected Rent, Dues, and Open Tickets
========================================================================================"""
    add_diagram_box(diag_workflow, caption="End-to-End Operational Workflow Diagram")

    # Deliverable 5: Full ER Diagram and Schema
    add_heading_2("Deliverable 5: Relational Database Design & Full ER Diagram")
    p = doc.add_paragraph(
        "Below is our complete relational database architecture. We have designed 9 interconnected tables "
        "enforcing strict foreign key constraints, default values, and data integrity."
    )

    diag_er = """========================================================================================
                         COMPLETE RELATIONAL ER DIAGRAM (POSTGRESQL)
========================================================================================

  ┌───────────────────┐               ┌────────────────────────┐
  │      owners       │ 1           M │       properties       │
  ├───────────────────┤───────────────├────────────────────────┤
  │ id (PK)           │               │ id (PK)                │
  │ full_name         │               │ owner_id (FK -> owners)│
  │ email, phone      │               │ name, code, type       │
  │ address           │               │ address, total_units   │
  └───────────────────┘               └────────────────────────┘
                                                  │ 1
                                                  │
                                                  │ M
                                      ┌────────────────────────┐
                                      │         units          │
                                      ├────────────────────────┤
                                      │ id (PK)                │
                                      │ property_id (FK)       │
                                      │ unit_number, floor     │
                                      │ area_sqft, base_rent   │
                                      │ deposit, status (Enum) │
                                      └────────────────────────┘
                                           │ 1             │ 1
                                           │               │
                                           │ M             │ M
                                           ▼               ▼
┌──────────────────┐               ┌───────────────┐  ┌────────────────────────┐
│     tenants      │ 1           M │    leases     │  │  maintenance_requests  │
├──────────────────┤───────────────├───────────────┤  ├────────────────────────┤
│ id (PK)          │               │ id (PK)       │  │ id (PK)                │
│ full_name        │               │ unit_id (FK)  │  │ unit_id (FK -> units)  │
│ email, phone     │               │ tenant_id(FK) │  │ tenant_id (FK)         │
│ id_proof_type    │               │ start_date    │  │ category, priority     │
│ id_proof_number  │               │ end_date      │  │ assigned_to (FK users) │
│ emergency_phone  │               │ monthly_rent  │  │ status, cost           │
│ status           │               │ rent_due_day  │  └────────────────────────┘
└──────────────────┘               │ status (Enum) │
                                   └───────────────┘
                                           │ 1
                                           │
                                           │ M
                                   ┌───────────────┐
                                   │   payments    │
                                   ├───────────────┤
                                   │ id (PK)       │
                                   │ lease_id (FK) │
                                   │ unit_id (FK)  │
                                   │ tenant_id(FK) │
                                   │ amount_due    │
                                   │ amount_paid   │
                                   │ due_date      │
                                   │ payment_date  │
                                   │ status (Enum) │
                                   │ payment_mode  │
                                   │ receipt_no    │
                                   └───────────────┘
========================================================================================"""
    add_diagram_box(diag_er, caption="Entity Relationship Diagram (ERD)")

    add_heading_3("Detailed Table Schema Specifications")
    db_schema_details = [
        ["users", "id (UUID, PK), full_name (VARCHAR), email (VARCHAR, UNIQUE), password_hash (VARCHAR), role (ENUM: ADMIN, MANAGER, ACCOUNTANT, STAFF), is_active (BOOLEAN), created_at (TIMESTAMP)"],
        ["owners", "id (UUID, PK), full_name (VARCHAR), email (VARCHAR), phone (VARCHAR), address (TEXT), created_at (TIMESTAMP)"],
        ["properties", "id (UUID, PK), owner_id (UUID, FK -> owners.id), name (VARCHAR), code (VARCHAR, UNIQUE), type (ENUM: RESIDENTIAL, COMMERCIAL, MIXED), address (TEXT), total_units (INT), status (VARCHAR)"],
        ["units", "id (UUID, PK), property_id (UUID, FK -> properties.id), unit_number (VARCHAR), floor (INT), wing (VARCHAR), area_sqft (DECIMAL), base_rent (DECIMAL), deposit (DECIMAL), status (ENUM: VACANT, OCCUPIED, RESERVED, MAINTENANCE)"],
        ["tenants", "id (UUID, PK), full_name (VARCHAR), email (VARCHAR), phone (VARCHAR), id_proof_type (VARCHAR), id_proof_number (VARCHAR), emergency_contact (VARCHAR), status (ENUM: ACTIVE, INACTIVE)"],
        ["leases", "id (UUID, PK), unit_id (UUID, FK -> units.id), tenant_id (UUID, FK -> tenants.id), start_date (DATE), end_date (DATE), monthly_rent (DECIMAL), deposit_amount (DECIMAL), rent_due_day (INT: 1-31), status (ENUM: ACTIVE, EXPIRED, TERMINATED)"],
        ["payments", "id (UUID, PK), lease_id (UUID, FK -> leases.id), unit_id (UUID, FK -> units.id), tenant_id (UUID, FK -> tenants.id), amount_due (DECIMAL), amount_paid (DECIMAL), due_date (DATE), payment_date (DATE, NULLABLE), status (ENUM: PAID, PENDING, OVERDUE), payment_mode (ENUM: CASH, UPI, BANK_TRANSFER, CHEQUE), receipt_no (VARCHAR)"],
        ["maintenance_requests", "id (UUID, PK), unit_id (UUID, FK -> units.id), tenant_id (UUID, FK -> tenants.id, NULLABLE), category (VARCHAR), priority (ENUM: LOW, MEDIUM, HIGH, URGENT), assigned_to (UUID, FK -> users.id, NULLABLE), status (ENUM: OPEN, IN_PROGRESS, RESOLVED, CLOSED), estimated_cost (DECIMAL), actual_cost (DECIMAL)"],
        ["expenses", "id (UUID, PK), property_id (UUID, FK -> properties.id), category (VARCHAR), amount (DECIMAL), expense_date (DATE), description (TEXT), receipt_url (VARCHAR)"],
        ["activity_logs", "id (UUID, PK), user_id (UUID, FK -> users.id), action (VARCHAR), entity_name (VARCHAR), entity_id (UUID), details (JSONB), created_at (TIMESTAMP)"]
    ]
    create_styled_table(["Table Name", "Columns, Data Types, Constraints & Foreign Keys"], db_schema_details, col_widths=[2.0, 4.5])

    # Deliverable 6: System Architecture Diagram
    add_heading_2("Deliverable 6: System Architecture Diagram")
    p = doc.add_paragraph("We are structuring the platform into a clean 3-Tier Layered Architecture:")

    diag_arch = """========================================================================================
                           3-TIER SYSTEM ARCHITECTURE DIAGRAM
========================================================================================

 [CLIENT PRESENTATION LAYER]
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │  React 18 (Vite SPA) + Tailwind CSS + Lucide Icons + TanStack Query               │
 │  ├── Top Navbar (Property Switcher, Search Bar, In-App Notifications)             │
 │  ├── Left Sidebar Navigation (Dashboard, Properties, Units, Leases, Payments...) │
 │  └── Responsive Viewport (Interactive 100-Unit Grid, Charts, Data Tables)        │
 └────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │ HTTPS / REST JSON (JWT in Cookies)
                                          ▼
 [APPLICATION API GATEWAY LAYER]
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │  Node.js + Express.js API Server (TypeScript)                                    │
 │  ├── Middleware: Helmet, Strict CORS, Rate Limiter, Body Parser                  │
 │  ├── Auth & RBAC Middleware: Verify JWT, Check User Roles                        │
 │  ├── Zod Request Validation: Validate DTOs, sanitize payload inputs              │
 │  ├── Controller Layer: Route handlers parsing requests and returning envelopes   │
 │  ├── Service Layer: Core business logic (Rent calculation, unit state machine)   │
 │  └── Background Cron Worker: Daily node-cron checking rent dues & lease expiries │
 └────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │ Prisma ORM (Type-Safe Query Builder)
                                          ▼
 [PERSISTENCE & STORAGE LAYER]
 ┌────────────────────────────────────────┴─────────────────────────────────────────┐
 │  PostgreSQL Database (Managed on Neon / Supabase)                                │
 │  ├── Relational Tables (Users, Properties, Units, Tenants, Leases, Payments...) │
 │  ├── B-Tree Indexes on Foreign Keys & Status fields for fast filtering           │
 │  ├── ACID Transactions for payment logging & unit lease creation                 │
 │  └── Cloud Storage (AWS S3 / Supabase Storage) for uploaded lease PDFs & bills    │
 └──────────────────────────────────────────────────────────────────────────────────┘
========================================================================================"""
    add_diagram_box(diag_arch, caption="3-Tier System Architecture Diagram")

    # Deliverable 7: UI/UX Wireframe Structure
    add_heading_2("Deliverable 7: UI/UX Wireframe Structure & Screen Layouts")
    p = doc.add_paragraph("Below are the ASCII screen layouts representing our planned frontend wireframes:")

    diag_wireframe = """========================================================================================
                          EXECUTIVE DASHBOARD WIREFRAME LAYOUT
========================================================================================
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [LOGO] Property CRM   │ Select Property: [Sunrise Residency ▼] │ [Search] │ 🔔 (3) │ 👤 │
├──────────────┬───────────────────────────────────────────────────────────────────────┤
│ [📊] Dashbrd │  [ Total Units ]    [ Occupied % ]   [ Rent Collected ]  [ Overdue ]  │
│ [🏢] Properts│       100 Units        84% (84 Occ)     ₹15,20,000         6 Tenants  │
│ [🚪] Units   ├────────────────────────────────────────┬──────────────────────────────┤
│ [👥] Tenants │ OCCUPANCY BREAKDOWN (CHART)            │ RECENT NOTIFICATIONS         │
│ [📄] Leases  │ [██████████████████░░░░] 84% Occupied  │ • Unit 102 Rent Overdue (5d) │
│ [💳] Payments│  84 Occupied | 12 Vacant | 4 Maint.    │ • Unit 104 Lease Expires Soon│
│ [🛠️] Mainten │                                        │ • New Plumbing Ticket #108   │
│ [📈] Reports ├────────────────────────────────────────┴──────────────────────────────┤
│ [⚙️] Settings│ QUICK ACTION 100-UNIT STATUS GRID                                     │
│              │ [101: OCC] [102: OCC] [103: VAC] [104: OCC] [105: OCC] [106: MNT] ... │
└──────────────┴───────────────────────────────────────────────────────────────────────┘

========================================================================================
                          UNIT DETAIL DOSSIER WIREFRAME LAYOUT
========================================================================================
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ < Back to Units  │  UNIT 101 - SUNRISE RESIDENCY           [Status: OCCUPIED (Green)]│
├───────────────────────────────────┬──────────────────────────────────────────────────┤
│ BASIC UNIT INFO                   │ CURRENT LEASE & TENANT DETAILS                   │
│ Floor: 1st Floor | Wing: A        │ Tenant: Ramesh Patel (Ph: 9876543210)            │
│ Size: 1,250 sq.ft | Type: 2BHK    │ Lease Duration: 01 Jan 2026 to 31 Dec 2026       │
│ Monthly Rent: ₹20,000             │ Monthly Rent: ₹20,000 | Deposit: ₹40,000 (Paid)  │
├───────────────────────────────────┴──────────────────────────────────────────────────┤
│ TABBED SECTION: [Payment History] | [Maintenance Tickets] | [Documents] | [Notes]   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Date        Month       Amount Due   Amount Paid   Status     Mode     Receipt       │
│ 01 Oct 2026 Oct 2026    ₹20,000      ₹20,000       PAID       UPI      #REC-2026-101 │
│ 01 Sep 2026 Sep 2026    ₹20,000      ₹20,000       PAID       Bank     #REC-2026-089 │
└──────────────────────────────────────────────────────────────────────────────────────┘"""
    add_diagram_box(diag_wireframe, caption="Frontend UI/UX Wireframe Layouts")

    # Deliverable 8: Tech Stack Recommendation
    add_heading_2("Deliverable 8: Technology Stack Recommendation & Trade-Offs")
    add_bullet("Selected: React + Node.js + PostgreSQL + Tailwind CSS. Outperforms PHP/MySQL in dynamic client reactivity; outperforms Python/Django in frontend-backend JavaScript unification.", "Final Selection")

    # Deliverable 9: API Spec & Sprint Plan
    add_heading_2("Deliverable 9: REST API Specification & 10-Week Sprint Roadmap")
    p = doc.add_paragraph("Below is the core API endpoint inventory we will implement:")

    api_endpoints_data = [
        ["POST /api/v1/auth/login", "Public", "User credentials (email, password)", "JWT token set in HttpOnly cookie + user profile"],
        ["GET /api/v1/properties", "Authenticated", "Query filters (status, search)", "List of properties with aggregate unit counts"],
        ["POST /api/v1/properties", "Manager/Admin", "Property details (name, code, units)", "Created property record"],
        ["GET /api/v1/units", "Authenticated", "propertyId, status, floor, search", "Filterable list of units with current lease status"],
        ["GET /api/v1/units/:id", "Authenticated", "Unit ID path param", "Complete unit dossier (tenant, lease, payments, tickets)"],
        ["POST /api/v1/leases", "Manager/Admin", "unitId, tenantId, dates, rent, deposit", "Created lease; auto-toggles unit status to OCCUPIED"],
        ["GET /api/v1/payments", "Accountant/Mgr", "propertyId, month, status (Paid/Overdue)", "Monthly rent ledger with payment reconciliation"],
        ["POST /api/v1/payments/:id/pay", "Accountant/Mgr", "amountPaid, paymentMode, referenceNo", "Marks payment PAID, records timestamp & receipt"],
        ["POST /api/v1/maintenance", "Authenticated", "unitId, category, priority, description", "Created ticket; alerts assigned maintenance staff"],
        ["PATCH /api/v1/maintenance/:id", "Staff/Manager", "status (Resolved), actualCost", "Updates ticket status and logs maintenance expense"],
        ["GET /api/v1/dashboard/kpis", "Manager/Admin", "propertyId (optional)", "Aggregated metrics: Occupancy %, Revenue, Overdue count"]
    ]
    create_styled_table(["Endpoint Route", "Access Level", "Request Payload", "Expected Response Output"], api_endpoints_data, col_widths=[2.0, 1.1, 1.7, 1.7])

    add_heading_3("10-Week Development Sprint Roadmap")
    sprint_table = [
        ["Sprint 1 (Weeks 1-2)", "DB Schema & Auth Foundation", "Configure PostgreSQL & Prisma. Implement Users table, JWT authentication, RBAC middleware, and base React app layout."],
        ["Sprint 2 (Weeks 3-4)", "Properties, Units & Tenants", "Build CRUD APIs and frontend views for Properties, Units, and Tenants. Implement unit status state transitions and filtering."],
        ["Sprint 3 (Weeks 5-6)", "Lease, Rent & Payment Engine", "Implement lease creation, monthly rent recurring dues generator, payment logging, and receipt numbers."],
        ["Sprint 4 (Weeks 7-8)", "Maintenance Desk & Dashboard", "Build maintenance ticket pipeline, cost tracking, executive dashboard KPI calculations, and chart visualizations."],
        ["Sprint 5 (Weeks 9-10)", "Reports, QA & Cloud Deployment", "Implement exportable reports, conduct end-to-end testing, Dockerize application, deploy to cloud, and rehearse final demo."]
    ]
    create_styled_table(["Sprint Phase", "Target Milestone", "Actionable Deliverables"], sprint_table, col_widths=[1.5, 2.0, 3.0])

    # Deliverables 10 - 14
    add_heading_2("Deliverable 10: MVP Development Codebase & Folder Hierarchy")
    add_bullet("Clean Monorepo with structured folders: `/frontend` (React+Vite), `/backend` (Express+TypeScript), `/prisma` (schema & migrations), `/docs` (architecture & API specs), and root `docker-compose.yml`.", "Repository Hygiene")

    add_heading_2("Deliverable 11: Testing & Quality Assurance Plan")
    add_bullet("Unit tests for financial balance updates and lease date overlap prevention; Integration tests verifying end-to-end workflows (Property creation -> Unit lease -> Payment recording).", "Test Strategy")

    add_heading_2("Deliverable 12: Final Product Demo Script")
    add_bullet("A crisp 10-minute senior walk-through demonstrating a 100-unit property scenario, finding overdue tenants in 2 clicks, and showing instant dashboard KPI updates.", "Demo Script")

    add_heading_2("Deliverable 13: College / Senior Presentation Deck Structure")
    add_bullet("Fully scripted 16-slide slide deck covering business value, architecture, live demo, and tech decisions (detailed in Point 21).", "Presentation Deck")

    add_heading_2("Deliverable 14: Future Scope & Improvement Roadmap")
    add_bullet("Documented Phase 2 and Phase 3 roadmap (Mobile apps, payment gateway integration, WhatsApp reminders, AI occupancy forecasting).", "Future Roadmap")

    doc.add_page_break()

    # =========================================================================
    # SECTION 20: PRESENTATION QUESTIONS & ANSWERS
    # =========================================================================
    add_heading_1("Point 20: Presentation Mastery – Intern Q&A Guide (Presentationમાં Internsએ શું સમજાવવું?)")
    
    p = doc.add_paragraph(
        "During senior review or academic evaluation, the intern must articulate the rationale behind the system. "
        "Below are the definitive, expert-level answers to all 12 key presentation questions, framed as what we are going to build and explain."
    )

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
         "In the MVP, we are engineering 100% functional core operations: Property/Unit inventory, Tenant onboarding, Lease agreements, Rent tracking, Maintenance ticketing, and Executive Dashboard. In Future phases, we will add Tenant/Owner mobile apps, automated WhatsApp notifications, online payment gateways, and AI rent forecasting.")
    ]
    
    for q_title, q_ans in qa_list:
        add_heading_2(q_title)
        p = doc.add_paragraph(q_ans)
        p.paragraph_format.space_after = Pt(4)

    doc.add_page_break()

    # =========================================================================
    # SECTION 21: SUGGESTED PRESENTATION FLOW (SLIDES 1 TO 16)
    # =========================================================================
    add_heading_1("Point 21: Presentation Slide-by-Slide Master Script (Slides 1 to 16)")
    
    p = doc.add_paragraph(
        "Below is our slide-by-slide script for the 16-slide presentation deck. Each slide contains the exact "
        "visual layout recommendation, speaker talking points, and core takeaway to impress seniors and evaluators."
    )

    slides_deck = [
        ["Slide 1", "Project Title & Introduction", "Project Logo, 'Property Management CRM', Presenter Names & Roles.", "Introduce the project as a modern operational cockpit for real estate managers, replacing scattered Excel and WhatsApp tracking."],
        ["Slide 2", "The Real-World Problem", "Split visual: Scattered Excel sheets + missed WhatsApp messages vs Lost Revenue.", "Explain how managing 100+ units manually leads to late rent, untracked repairs, and chaotic records."],
        ["Slide 3", "Proposed Solution", "Central CRM Hub diagram connecting Properties, Tenants, Finance, and Maintenance.", "Present the solution: A unified web platform giving managers 360-degree operational visibility in real time."],
        ["Slide 4", "Target Users & Personas", "User icons: Super Admin, Property Manager, Accountant, Staff, Owner.", "Detail user roles, their responsibilities, and how RBAC protects financial records while enabling smooth daily operations."],
        ["Slide 5", "System Architecture & High-Level Flow", "3-Tier architectural diagram: React UI -> Express REST API -> PostgreSQL DB.", "Explain the separation of concerns, scalability to thousands of units, and clean API data contracts."],
        ["Slide 6", "Property & Unit Management", "Tree diagram: Property ('Sunrise Residency') -> 100 Units with color status badges.", "Demonstrate multi-unit management, unit state transitions (Vacant to Occupied), and instant filtering."],
        ["Slide 7", "Tenant & Lease Management", "Lease lifecycle diagram linking Tenant KYC to Unit with date terms.", "Explain how agreements bind tenants to units, track security deposits, and establish automated rent schedules."],
        ["Slide 8", "Rent & Payment Tracking Ledger", "Mock screenshot of the payment ledger: Paid, Pending, and Overdue badges.", "Showcase monthly dues generation, partial/full payment recording, and automated overdue identification."],
        ["Slide 9", "Maintenance Ticket Desk", "Kanban/Pipeline visual: Open -> In Progress -> Resolved -> Closed with priority tags.", "Explain how tenant repair complaints are logged, assigned to technicians, tracked for costs, and closed transparently."],
        ["Slide 10", "Executive Dashboard & Reports", "Screenshot of the 15-second KPI dashboard: Occupancy %, Revenue cards, Alerts.", "Present the command center where managers make decisions in seconds based on live financial and operational data."],
        ["Slide 11", "Database Architecture & ER Diagram", "Clean ER Diagram showing tables, primary keys, and foreign key relations.", "Explain the relational schema, data integrity constraints, indexing strategy, and why PostgreSQL was chosen."],
        ["Slide 12", "Security, RBAC & Data Integrity", "Security shield graphic: JWT, Bcrypt, Middleware guards, Soft-deletes.", "Reassure evaluators of enterprise security: strict authentication, permission middleware, and audit logs."],
        ["Slide 13", "Technology Stack Justification", "Logos of React, Vite, Node.js, Express, PostgreSQL, Prisma, Tailwind CSS.", "Defend stack decisions: performance, maintainability, type-safety, and developer productivity."],
        ["Slide 14", "Live MVP Demonstration", "Live product demo walkthrough: Adding unit, leasing, paying rent, viewing dashboard.", "Perform the end-to-end 10-minute demo, highlighting real-time updates and seamless usability."],
        ["Slide 15", "Future Roadmap (Phases 2 & 3)", "Roadmap timeline: Mobile App, Payment Gateway, WhatsApp API, AI Analytics.", "Show ambition and vision: how the MVP evolves into an enterprise-grade SaaS platform."],
        ["Slide 16", "Conclusion & Key Takeaways", "Summary checkmarks: Centralized, Scalable, Production-Ready + Q&A invitation.", "Summarize achievements, express gratitude to mentors/seniors, and open the floor for questions."]
    ]
    create_styled_table(["Slide #", "Slide Topic", "Recommended Visual Content", "Presenter Speaking Script & Key Takeaway"], slides_deck, col_widths=[0.8, 1.5, 2.0, 2.2])

    doc.add_page_break()

    # =========================================================================
    # SECTION 22 TO 25: SUCCESS CRITERIA, VISION, SUMMARY & ROADMAP
    # =========================================================================
    add_heading_1("Points 22, 23, 24 & 25: Success Criteria, Vision, Summary & Roadmap")

    add_heading_2("Point 22: Project Success Criteria (How to Validate Success)")
    p = doc.add_paragraph("The success of this CRM will be evaluated against 7 objective engineering criteria:")

    success_table_data = [
        ["1. Data Centralization", "100% of property, unit, tenant, lease, payment, and maintenance data lives in PostgreSQL—zero reliance on spreadsheets."],
        ["2. Relational Integrity", "All foreign key relations work seamlessly without orphaned data. Deleting or archiving a unit maintains data consistency."],
        ["3. End-to-End Workflows", "A complete workflow from property onboarding to unit lease, rent payment, maintenance resolution, and reporting executes without errors."],
        ["4. 15-Second Dashboard", "The dashboard loads in < 1.5 seconds and conveys total occupancy, monthly collection, dues, and urgent tickets within 15 seconds."],
        ["5. Practical Search & Filters", "Searching a 100-unit building by tenant name, unit number, or payment status yields instant results."],
        ["6. Role-Based Access Control", "Accountants cannot edit property info; maintenance staff cannot view financial ledgers; unauthorized access is blocked with 403."],
        ["7. Real-World Demo Quality", "The live demo effortlessly simulates a 100-unit property with realistic multi-unit data and edge cases (vacancies, late payments)."]
    ]
    create_styled_table(["Success Benchmark", "Verification & Operational Requirement"], success_table_data, col_widths=[2.2, 4.3])

    add_heading_2("Point 23: Final Project Vision (From 10 Units to Enterprise Scale)")
    p = doc.add_paragraph(
        "Our ultimate vision is to build an enterprise-ready multi-tenant SaaS platform capable of scaling "
        "from a single 10-unit building to thousands of units across multiple commercial and residential portfolios. "
        "The architecture is designed with modular microservice readiness, clean data boundaries, and multi-tenancy "
        "support to enable property management firms to manage multiple client portfolios under isolated security partitions."
    )

    add_heading_2("Point 24: One-Line Project Summary (Elevator Pitch)")
    add_callout(
        "English: \"A unified, high-performance web CRM that centralizes Properties, Units, Tenants, Leases, Payments, Maintenance, and Real-Time Analytics into a single operational cockpit.\"\n\n"
        "ગુજરાતી: \"એક જ પ્લેટફોર્મ પરથી Properties, Units, Tenants, Agreements, Rent, Payments, Maintenance અને Reportsનું સંપૂર્ણ અને સરળ સંચાલન.\"",
        title="Official Project Elevator Pitch"
    )

    add_heading_2("Point 25: Important Engineering Note & Execution Sequence for Interns")
    p = doc.add_paragraph("Point 25 establishes the golden engineering rules and sequential development path:")
    
    add_bullet("Never write frontend code before the database schema and API contracts are signed off. Changing schemas mid-way causes massive rework.", "Rule 1: Never Code Blindly")
    add_bullet("If a business rule is unclear (e.g., handling partial rent payments), document the assumptions and get clarification from the senior immediately.", "Rule 2: Clarify Before Assuming")
    add_bullet("Strictly follow the 7-step engineering development sequence below:", "Rule 3: Follow the Sequential Lifecycle")

    step_sequence = [
        ["Step 1", "Scope Freeze", "Lock MVP boundary (Point 16) and sign off with senior."],
        ["Step 2", "UI/UX & Wireframes", "Design screen hierarchy and confirm user flow for 100-unit scenario."],
        ["Step 3", "Database Architecture", "Draft PostgreSQL ER schema, constraints, indexes, and write Prisma migrations."],
        ["Step 4", "Backend API Engine", "Implement Express controllers, services, JWT auth, and RBAC middleware."],
        ["Step 5", "Frontend Implementation", "Build React UI components, integrate TanStack Query, and wire up live API endpoints."],
        ["Step 6", "QA & Edge Case Testing", "Test financial calculations, status transitions, invalid inputs, and error handlers."],
        ["Step 7", "Deployment & Demo Prep", "Deploy on cloud, populate 100-unit realistic seed data, and rehearse 16-slide presentation."]
    ]
    create_styled_table(["Step", "Milestone", "Actionable Intern Objective"], step_sequence, col_widths=[1.0, 1.8, 3.7])

    add_callout(
        "By following this structured blueprint, the intern team is guaranteed to deliver an exceptional, "
        "academically sound, and industry-standard product on time, earning full confidence from seniors and evaluators.",
        title="Final Implementation Endorsement"
    )

    # Save output
    output_filename = "Property_Management_CRM_Intern_Execution_Plan_and_Blueprint.docx"
    doc.save(output_filename)
    print(f"File successfully generated and saved as '{output_filename}'")

if __name__ == "__main__":
    generate_intern_solution_document()
