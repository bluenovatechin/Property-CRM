import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import os

def set_cell_background(cell, fill_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def create_document():
    doc = docx.Document()

    # Set page margins (0.75 in)
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    # Color definitions
    NAVY = RGBColor(30, 58, 138)       # #1E3A8A
    TEAL = RGBColor(13, 148, 136)      # #0D9488
    DARK = RGBColor(31, 41, 55)        # #1F2937
    GRAY = RGBColor(107, 114, 128)     # #6B7280
    WHITE = RGBColor(255, 255, 255)

    # Document Title
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    run_title = title_p.add_run("Free Rental Property APIs for Florida, USA")
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(24)
    run_title.font.bold = True
    run_title.font.color.rgb = NAVY

    subtitle_p = doc.add_paragraph()
    subtitle_p.paragraph_format.space_before = Pt(0)
    subtitle_p.paragraph_format.space_after = Pt(16)
    run_sub = subtitle_p.add_run("Comprehensive Directory of Free Tiers, Rental Data Details, Endpoints, and Setup Instructions")
    run_sub.font.name = "Calibri"
    run_sub.font.size = Pt(12)
    run_sub.font.italic = True
    run_sub.font.color.rgb = TEAL

    # Executive Summary Callout Box
    table_callout = doc.add_table(rows=1, cols=1)
    table_callout.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_callout.autofit = False
    table_callout.columns[0].width = Inches(7.0)
    cell = table_callout.rows[0].cells[0]
    set_cell_background(cell, "F3F4F6")
    set_cell_margins(cell, top=140, bottom=140, left=180, right=180)

    p_callout = cell.paragraphs[0]
    p_callout.paragraph_format.space_before = Pt(0)
    p_callout.paragraph_format.space_after = Pt(4)
    r_c1 = p_callout.add_run("Executive Note on API Keys & Licensing:\n")
    r_c1.bold = True
    r_c1.font.size = Pt(10.5)
    r_c1.font.color.rgb = NAVY

    r_c2 = p_callout.add_run(
        "API keys are unique developer authentication credentials tied to individual user accounts. Pre-existing private keys cannot legally or securely be distributed. However, every provider below offers a 100% free tier (or public instant sandbox) that you can register for immediately with zero upfront cost. This guide covers the top APIs for searching homes, flats, apartments, and condos for rent across Florida."
    )
    r_c2.font.size = Pt(10)
    r_c2.font.color.rgb = DARK

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # Section 1: Comparison Matrix
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(12)
    h1.paragraph_format.space_after = Pt(6)
    r_h1 = h1.add_run("1. Comparison Matrix: Free Rental Property APIs")
    r_h1.font.name = "Calibri"
    r_h1.font.size = Pt(16)
    r_h1.font.bold = True
    r_h1.font.color.rgb = NAVY

    # Table
    matrix_table = doc.add_table(rows=6, cols=5)
    matrix_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    col_widths = [Inches(1.3), Inches(1.1), Inches(1.8), Inches(1.4), Inches(1.4)]
    
    headers = [
        "API Provider",
        "Free Tier Allowance",
        "Rental Details Provided",
        "Florida Coverage",
        "Best Use Case"
    ]

    # Format header row
    hdr_cells = matrix_table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "1E3A8A")
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=100, right=100)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.bold = True
            run.font.color.rgb = WHITE
            run.font.size = Pt(9.5)

    data = [
        (
            "RentCast API",
            "50 requests / month (Free Developer)",
            "Rent price, beds, baths, sqft, property type, active listings, rent estimate (AVM), comps, historical market trends",
            "Statewide (Miami, Orlando, Tampa, Jax, etc. by ZIP/City/State)",
            "Dedicated rental data, AVM valuations & rental comps"
        ),
        (
            "Realty in US\n(via RapidAPI)",
            "Free Basic tier on RapidAPI",
            "Active listings, MLS photos, agent/landlord info, deposit, pet rules, amenities, property features",
            "Statewide MLS & Realtor.com feeds across all FL cities",
            "Live MLS listings with high-res photo galleries"
        ),
        (
            "Real-Time Real Estate Data (OpenWeb Ninja)",
            "~100 requests / month (Free Basic)",
            "Live rental listings (Zillow/Redfin), price reductions, coordinates, days on market, floor plans",
            "Statewide (coordinate bounding box, ZIP, or city)",
            "Real-time Zillow/Redfin rental scraping"
        ),
        (
            "SimplyRETS",
            "Unlimited sandbox / demo key",
            "RESO Web API standard, lease terms, HOA fees, school districts, detailed room dimensions",
            "Sample MLS test data (production requires MLS broker board approval)",
            "MLS standard compliance & prototype app development"
        ),
        (
            "Mashvisor API\n(via RapidAPI)",
            "Free tier on RapidAPI",
            "Long-term rent vs short-term (Airbnb) rates, cap rate, cash-on-cash return, occupancy rate",
            "Florida metro & vacation rental hot spots",
            "Rental investment analysis & cash flow estimation"
        )
    ]

    for row_idx, row_data in enumerate(data, start=1):
        row = matrix_table.rows[row_idx]
        bg_color = "F9FAFB" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(row_data):
            cell = row.cells[col_idx]
            cell.text = text
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=100, bottom=100, left=100, right=100)
            p = cell.paragraphs[0]
            if col_idx in [0, 1]:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.size = Pt(8.5)
                r.font.color.rgb = DARK
                if col_idx == 0:
                    r.font.bold = True

    # Adjust widths
    for row in matrix_table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # Detailed Section 2
    h2 = doc.add_paragraph()
    h2.paragraph_format.space_before = Pt(12)
    h2.paragraph_format.space_after = Pt(6)
    r_h2 = h2.add_run("2. Detailed API Breakdown & How to Obtain Free Keys")
    r_h2.font.name = "Calibri"
    r_h2.font.size = Pt(16)
    r_h2.font.bold = True
    r_h2.font.color.rgb = NAVY

    apis_detail = [
        {
            "name": "1. RentCast API (Top Recommended)",
            "url": "https://developers.rentcast.io | Dashboard: https://app.rentcast.io/app/api",
            "allowance": "50 requests per month on the Developer (Free) Plan. No credit card required.",
            "data_points": [
                "Active For-Rent Listings: Asking monthly rent, listing date, days on market, original source link.",
                "Property Details: Property type (Single Family, Condo, Townhouse, Apartment, Manufactured), bedrooms, bathrooms, square footage, year built, lot size.",
                "Automated Rent Valuation (AVM): Estimated rent price, low-to-high valuation band, confidence score.",
                "Rental Comparables (Comps): Nearby similar rented properties within a customizable radius (distance, similarity score).",
                "Historical Trends: Average rent by bedroom count and property type aggregated by ZIP code."
            ],
            "fl_coverage": "Statewide coverage across all 67 Florida counties and all ZIP codes (Miami, Orlando, Tampa, Jacksonville, Fort Lauderdale, St. Petersburg, Tallahassee, etc.).",
            "how_to_get": [
                "Visit https://app.rentcast.io/app/api and create a free account.",
                "Go to the 'API Keys' section in your developer dashboard and click 'Create Key'.",
                "Ensure your billing plan is set to the Developer (Free) tier ($0/mo).",
                "Include the key in your HTTP requests inside the header: 'X-Api-Key: <YOUR_KEY>'."
            ],
            "sample_curl": 'curl -X GET "https://api.rentcast.io/v1/listings/rental/long-term?state=FL&city=Orlando&status=Active&limit=10" \\\n  -H "Accept: application/json" \\\n  -H "X-Api-Key: YOUR_FREE_RENTCAST_KEY"'
        },
        {
            "name": "2. Realty in US (Realtor.com Data via RapidAPI)",
            "url": "https://rapidapi.com/apidojo/api/realty-in-us",
            "allowance": "Free Basic subscription available directly through RapidAPI marketplace.",
            "data_points": [
                "Live Rental Listings: Real-time rental properties directly from MLS / Realtor.com index.",
                "High-Resolution Photos: Full photo galleries for each unit and exterior shots.",
                "Leasing Contact: Listing agent name, phone number, and management company details.",
                "Unit Amenities: In-unit laundry, dishwasher, central AC, pool, parking spaces, pet policy (deposit, breed restrictions).",
                "Community Details: Neighborhood descriptions, school ratings, and nearby amenities."
            ],
            "fl_coverage": "Full Florida coverage by searching `state_code=FL`, `city=Miami`, or specific postal codes (e.g. `33139`).",
            "how_to_get": [
                "Create a free developer account at https://rapidapi.com.",
                "Navigate to the 'Realty in US' API page.",
                "Click on the 'Pricing' tab and choose the 'Basic (Free)' plan.",
                "Copy your 'X-RapidAPI-Key' and test queries immediately in the interactive console."
            ],
            "sample_curl": 'curl -X GET "https://realty-in-us.p.rapidapi.com/properties/v3/list?state_code=FL&city=Tampa&limit=10&status=for_rent" \\\n  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \\\n  -H "X-RapidAPI-Host: realty-in-us.p.rapidapi.com"'
        },
        {
            "name": "3. Real-Time Real Estate Data (OpenWeb Ninja via RapidAPI)",
            "url": "https://rapidapi.com/letscrape-6bRBa3QguO5/api/real-time-real-estate-data",
            "allowance": "Around 100 free requests per month on the Basic plan (hard-capped to prevent overage).",
            "data_points": [
                "Live Portals Feed: Aggregated listings mirroring Zillow and Redfin rental sections.",
                "Rental Price Changes: Historical price drops, previous listing prices, and date changed.",
                "Floor Plans & Media: Unit layout diagrams, floor plan details, and high-definition photography.",
                "Geospatial Coordinates: Precise latitude and longitude for mapping rental clusters on Google Maps or Leaflet."
            ],
            "fl_coverage": "Supports queries by City/State, ZIP code, or latitude/longitude bounding boxes across Florida.",
            "how_to_get": [
                "Sign up at RapidAPI.",
                "Subscribe to the free tier of 'Real-Time Real Estate Data'.",
                "Use your standard RapidAPI key in your application headers."
            ],
            "sample_curl": 'curl -X GET "https://real-time-real-estate-data.p.rapidapi.com/search?location=Jacksonville%2C%20FL&home_type=Rentals" \\\n  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \\\n  -H "X-RapidAPI-Host: real-time-real-estate-data.p.rapidapi.com"'
        },
        {
            "name": "4. SimplyRETS (Instant Sandbox Key)",
            "url": "https://simplyrets.com | Docs: https://docs.simplyrets.com",
            "allowance": "Unlimited free requests in demo/sandbox mode. No credit card, immediate testing.",
            "data_points": [
                "Standardized MLS schema (RESO Web API compliant).",
                "Lease Terms: Annual, monthly, security deposit amounts, application fee requirements.",
                "Interior & Structural Features: Heating/cooling types, square feet, room counts, flooring materials.",
                "HOA / Condominium Rules: Association fees, approval period, rental restrictions."
            ],
            "fl_coverage": "Sandbox contains test datasets; connecting live Florida MLS requires MLS board credentials.",
            "how_to_get": [
                "No registration needed to test! SimplyRETS provides public test credentials:",
                "Username: simplyrets | Password: simplyrets",
                "Pass these credentials via HTTP Basic Authentication."
            ],
            "sample_curl": 'curl -X GET "https://api.simplyrets.com/properties?type=rental&limit=5" \\\n  -u simplyrets:simplyrets'
        },
        {
            "name": "5. Mashvisor API (Rental Investment & Analytics)",
            "url": "https://rapidapi.com/mashvisor-team/api/mashvisor",
            "allowance": "Free tier available on RapidAPI for evaluating rental analytics and markets.",
            "data_points": [
                "Dual Rental Comparison: Traditional long-term lease rates vs. Short-term (Airbnb) rental revenue.",
                "Financial Metrics: Cash-on-cash return, cap rate, estimated monthly cash flow, occupancy rate.",
                "Rental Comps: Comparative analysis of similar leased units in the surrounding radius."
            ],
            "fl_coverage": "High density in key Florida investment markets (Miami Beach, Orlando, Kissimmee, Tampa Bay, Fort Lauderdale).",
            "how_to_get": [
                "Search 'Mashvisor' on RapidAPI and activate the free plan.",
                "Query by Florida city or ZIP code to receive rental performance estimates."
            ],
            "sample_curl": 'curl -X GET "https://mashvisor-api.p.rapidapi.com/rental-rates?city=Miami&state=FL" \\\n  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \\\n  -H "X-RapidAPI-Host: mashvisor-api.p.rapidapi.com"'
        }
    ]

    for api in apis_detail:
        p_name = doc.add_paragraph()
        p_name.paragraph_format.space_before = Pt(10)
        p_name.paragraph_format.space_after = Pt(2)
        r_n = p_name.add_run(api["name"])
        r_n.font.size = Pt(13)
        r_n.font.bold = True
        r_n.font.color.rgb = TEAL

        p_url = doc.add_paragraph()
        p_url.paragraph_format.space_before = Pt(0)
        p_url.paragraph_format.space_after = Pt(4)
        r_u = p_url.add_run(f"Links: {api['url']}")
        r_u.font.size = Pt(9.5)
        r_u.font.italic = True
        r_u.font.color.rgb = GRAY

        p_a = doc.add_paragraph()
        p_a.paragraph_format.space_before = Pt(2)
        p_a.paragraph_format.space_after = Pt(2)
        r_al = p_a.add_run("Free Tier Allowance: ")
        r_al.bold = True
        r_al.font.size = Pt(9.5)
        r_al_val = p_a.add_run(api["allowance"])
        r_al_val.font.size = Pt(9.5)

        p_cov = doc.add_paragraph()
        p_cov.paragraph_format.space_before = Pt(2)
        p_cov.paragraph_format.space_after = Pt(2)
        r_c = p_cov.add_run("Florida Coverage: ")
        r_c.bold = True
        r_c.font.size = Pt(9.5)
        r_c_val = p_cov.add_run(api["fl_coverage"])
        r_c_val.font.size = Pt(9.5)

        # Rental Details bullets
        p_dt = doc.add_paragraph()
        p_dt.paragraph_format.space_before = Pt(4)
        p_dt.paragraph_format.space_after = Pt(2)
        r_d = p_dt.add_run("Key Rental Data Points Returned:")
        r_d.bold = True
        r_d.font.size = Pt(9.5)

        for dp in api["data_points"]:
            bp = doc.add_paragraph(style='List Bullet')
            bp.paragraph_format.space_before = Pt(0)
            bp.paragraph_format.space_after = Pt(1)
            rb = bp.add_run(dp)
            rb.font.size = Pt(9)
            rb.font.color.rgb = DARK

        # How to get free key
        p_hg = doc.add_paragraph()
        p_hg.paragraph_format.space_before = Pt(4)
        p_hg.paragraph_format.space_after = Pt(2)
        r_hg = p_hg.add_run("How to Obtain Free Key:")
        r_hg.bold = True
        r_hg.font.size = Pt(9.5)

        for step in api["how_to_get"]:
            sp = doc.add_paragraph(style='List Bullet')
            sp.paragraph_format.space_before = Pt(0)
            sp.paragraph_format.space_after = Pt(1)
            rs = sp.add_run(step)
            rs.font.size = Pt(9)
            rs.font.color.rgb = DARK

        # Code block
        p_cb = doc.add_paragraph()
        p_cb.paragraph_format.space_before = Pt(4)
        p_cb.paragraph_format.space_after = Pt(8)
        
        # Render code box as a 1x1 table
        code_table = doc.add_table(rows=1, cols=1)
        code_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        code_table.autofit = False
        code_table.columns[0].width = Inches(7.0)
        c_cell = code_table.rows[0].cells[0]
        set_cell_background(c_cell, "1F2937") # Dark code background
        set_cell_margins(c_cell, top=80, bottom=80, left=120, right=120)

        cp = c_cell.paragraphs[0]
        cp.paragraph_format.space_before = Pt(0)
        cp.paragraph_format.space_after = Pt(0)
        rc = cp.add_run(api["sample_curl"])
        rc.font.name = "Consolas"
        rc.font.size = Pt(8)
        rc.font.color.rgb = RGBColor(243, 244, 246)

    # Section 3: Florida Open Public Property APIs (GIS & Appraisers)
    h3 = doc.add_paragraph()
    h3.paragraph_format.space_before = Pt(16)
    h3.paragraph_format.space_after = Pt(6)
    r_h3 = h3.add_run("3. 100% Free Public Florida County & Government Property APIs")
    r_h3.font.name = "Calibri"
    r_h3.font.size = Pt(16)
    r_h3.font.bold = True
    r_h3.font.color.rgb = NAVY

    p_gov_desc = doc.add_paragraph()
    p_gov_desc.paragraph_format.space_after = Pt(6)
    r_gd = p_gov_desc.add_run(
        "If your application requires verifying official property records, parcel boundaries, zoning, structural details, square footage, owner information, and assessed tax values, Florida county property appraisers provide 100% free open REST APIs with NO rate limits or API keys needed:"
    )
    r_gd.font.size = Pt(9.5)
    r_gd.font.color.rgb = DARK

    gov_sources = [
        ("Miami-Dade County GIS Open Data:", "Public ArcGIS REST API providing parcel IDs, building square footage, bedrooms/bathrooms, year built, and zoning for Miami, Miami Beach, and surrounding cities. Endpoint: https://gis-mdc.opendata.arcgis.com"),
        ("Orange County Property Appraiser (Orlando):", "Free REST search endpoints for parcel records, sales history, building sketches, and land use codes in the Orlando metropolitan area. Endpoint: https://www.ocpafl.org"),
        ("Hillsborough County (Tampa):", "ArcGIS Feature Services providing open access to residential parcel boundaries, aerial imagery, and tax roll data. Endpoint: https://hcpafl.org"),
        ("Florida Geographic Data Library (FGDL):", "Statewide centralized repository hosted by the University of Florida aggregating parcel data, flood zones, land use, and infrastructure for all 67 Florida counties. Endpoint: https://www.fgdl.org")
    ]

    for title, desc in gov_sources:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_before = Pt(2)
        bp.paragraph_format.space_after = Pt(2)
        r_bt = bp.add_run(title + " ")
        r_bt.bold = True
        r_bt.font.size = Pt(9.5)
        r_bt.font.color.rgb = TEAL
        r_bd = bp.add_run(desc)
        r_bd.font.size = Pt(9)
        r_bd.font.color.rgb = DARK

    # Section 4: Implementation Guidance for Property CRM
    h4 = doc.add_paragraph()
    h4.paragraph_format.space_before = Pt(16)
    h4.paragraph_format.space_after = Pt(6)
    r_h4 = h4.add_run("4. Recommended Architecture for Property Management CRM")
    r_h4.font.name = "Calibri"
    r_h4.font.size = Pt(16)
    r_h4.font.bold = True
    r_h4.font.color.rgb = NAVY

    recs = [
        ("Primary Rental Feed: ", "Use the RentCast API Developer tier for clean, normalized JSON responses covering long-term active rentals and rent estimates across Florida."),
        ("Listing Photos & Landlord Contacts: ", "Use the Realty in US API (via RapidAPI) to display complete photo carousels and verified leasing agent phone numbers."),
        ("Caching Strategy: ", "Store rental listings and property attributes in your CRM database (PostgreSQL/MySQL) with a 24-to-48-hour cache to avoid exhausting free monthly API request quotas."),
        ("Map Visualization: ", "Extract latitude and longitude coordinates from the API responses and plot listings on interactive maps using Leaflet.js or Google Maps Platform.")
    ]

    for r_title, r_desc in recs:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_before = Pt(2)
        bp.paragraph_format.space_after = Pt(2)
        rt = bp.add_run(r_title)
        rt.bold = True
        rt.font.size = Pt(9.5)
        rt.font.color.rgb = NAVY
        rd = bp.add_run(r_desc)
        rd.font.size = Pt(9)
        rd.font.color.rgb = DARK

    output_path = r"f:\BlueNova\Property Management CRM\testingAPI\Free_Rental_Property_APIs_Florida.docx"
    doc.save(output_path)
    print(f"Successfully generated Word document at: {output_path}")

if __name__ == "__main__":
    create_document()
