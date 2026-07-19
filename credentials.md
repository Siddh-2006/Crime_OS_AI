# Crime OS Test Credentials

Here is a quick reference for all the test accounts available in the local environment.

## 1. Admin / City Head
Used for managing the system, including adding new departments to the registry.

- **URL:** [http://localhost:3000/admin/login](http://localhost:3000/admin/login)
- **Email/Username:** `admin@police.gov.in`
- **Password:** `AdminPassword123!`

## 2. Police Officers (IO & SHO)
Used for investigating cases, viewing the dashboard, assigning cases, and drafting requests to departments.

- **URL:** [http://localhost:3000/login](http://localhost:3000/login) *(Select the "Police Officer" toggle)*

**Investigating Officer (IO):**
- **Email/Username:** `io@police.gov.in`
- **Password:** `password123`

**Station House Officer (SHO):**
- **Email/Username:** `sho@police.gov.in`
- **Password:** `password123`

## 3. Department Portal (Mock Entities)
Used by mock departments (e.g., banks, telecom, crypto exchanges) to respond to IO requests. The username is typically the lowercase `entity_id` with spaces replaced by underscores. 

- **URL:** [http://localhost:3000/department/login](http://localhost:3000/department/login)
- **Password (for all mock departments):** `Testing123!`

### How Department Usernames are Generated:
The system automatically generates a mock username for each department based on its `entity_id`. The rule is: convert to lowercase and replace any non-alphanumeric characters with an underscore (`_`).

### Full List of Available Department Usernames (Entity ID -> Username):
- **WazirX** (`wazirx_crypto`) -> `wazirx_crypto`
- **Generic Bank** (`bank_generic`) -> `bank_generic`
- **Telecom Operator** (`telecom_operator`) -> `telecom_operator`
- **Meta Platforms** (`meta_platforms`) -> `meta_platforms`
- **Google LLC** (`google_llc`) -> `google_llc`
- **UPI / NPCI** (`upi_npci`) -> `upi_npci`
- **VASP Crypto Exchange** (`vasp_crypto_exchange`) -> `vasp_crypto_exchange`
- **RTO Parivahan** (`rto_parivahan`) -> `rto_parivahan`
- **Hospital / Medical** (`hospital_forensic_medical`) -> `hospital_forensic_medical`
- **Forensic Science Lab** (`forensic_science_lab`) -> `forensic_science_lab`
- **Railway Police** (`railway_police`) -> `railway_police`
- **Immigration / Border** (`immigration_border`) -> `immigration_border`
- **Employer / Labour Dept** (`employer_labour_dept`) -> `employer_labour_dept`
- **Insurance Company** (`insurance_company`) -> `insurance_company`
- **E-commerce Platform** (`ecommerce_platform`) -> `ecommerce_platform`
- **ISP (Non-Telecom)** (`isp_non_telecom`) -> `isp_non_telecom`
- **Court / Magistrate** (`court_magistrate_office`) -> `court_magistrate_office`
- **UIDAI / Aadhaar** (`uidai_aadhaar`) -> `uidai_aadhaar`
- **DigiLocker / MeitY** (`digilocker_meity`) -> `digilocker_meity`
- **CERT-In** (`cert_in`) -> `cert_in`
- **MCA21 / ROC** (`mca21_roc`) -> `mca21_roc`
- **Sub-Registrar (Property)** (`sub_registrar_property`) -> `sub_registrar_property`
- **Passport Seva Kendra** (`passport_seva_kendra`) -> `passport_seva_kendra`
- **State Cyber Cell CID** (`state_cyber_cell_cid`) -> `state_cyber_cell_cid`
- **Excise Dept / NCB** (`excise_dept_ncb`) -> `excise_dept_ncb`
- **Arms Licensing Authority** (`arms_licensing_authority`) -> `arms_licensing_authority`
- **Municipal Corporation** (`municipal_corporation`) -> `municipal_corporation`
- **Private CCTV Sources** (`private_cctv_sources`) -> `private_cctv_sources`
- **Pawn Shops / Jewelers** (`pawn_shops_jewelers`) -> `pawn_shops_jewelers`
- **Fire Brigade** (`fire_brigade`) -> `fire_brigade`
- **Postal / Courier** (`postal_courier_companies`) -> `postal_courier_companies`
- **Ride-hailing / Delivery** (`ridehailing_delivery_apps`) -> `ridehailing_delivery_apps`
- **Dating / Matrimonial** (`dating_matrimonial_platforms`) -> `dating_matrimonial_platforms`
- **One Stop Centre (181)** (`one_stop_centre_181`) -> `one_stop_centre_181`
- **CWC / JJB Nodes** (`cwc_jjb_nodes`) -> `cwc_jjb_nodes`
- **Prisons Department** (`prisons_department`) -> `prisons_department`

## 4. Citizen
Used by citizens to file complaints or respond to citizen requests.

- **URL:** [http://localhost:3000/login](http://localhost:3000/login)
- **Username:** `rakesh` (Email: `rakesh@test.com`)
- **Password:** `password123`
