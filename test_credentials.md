# Crime OS Tester Credentials

Here are the unified test credentials across all modules. This script is idempotent and guarantees these accounts exist.

| Role | Username / Email | Password | Dashboard / Login URL |
|---|---|---|---|
| Admin / City Head | `admin@police.gov.in` | `AdminPassword123!` | [Link](http://localhost:3000/admin/login) |
| Investigating Officer (IO) | `io@police.gov.in` | `password123` | [Link](http://localhost:3000/login) |
| Station House Officer (SHO) | `sho@police.gov.in` | `password123` | [Link](http://localhost:3000/login) |
| Citizen | `rakesh@test.com` | `password123` | [Link](http://localhost:3000/login) |

*Note: For Police accounts (IO and SHO), use the unified `/login` route and select the "Police Officer" toggle.*
