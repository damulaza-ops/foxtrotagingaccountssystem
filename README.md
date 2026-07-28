# Foxtrot Accounts Flow

Build a production-ready web application called Foxtrot Aging Accounts System.

The purpose of the system is to help Foxtrot track customer invoices, payments, outstanding balances, due dates, and overdue accounts.

Do not build a full ERP, inventory system, payroll system, or general accounting platform. Keep the application focused on aging accounts and accounts receivable.

Use React, TypeScript, Tailwind CSS, shadcn/ui, Supabase, and Supabase Authentication.

Core Modules

Create the following navigation items:

Dashboard

Aging Accounts

Customers

Invoices

Payments

Settled Accounts

Excel Import

Reports

Users

Settings

Dashboard

Display summary cards for:

Total outstanding balance

Total overdue balance

Total amount collected

Number of customers with balances

Number of overdue accounts

Number of critical accounts

Number of settled accounts

Add charts for:

Aging balance distribution

Outstanding balance by customer

Monthly invoices versus payments

Payments collected by month

Add a table showing accounts that require immediate follow-up.

Customers

Create a customer-management page with:

Customer code

Business name

Branch name

Contact person

Telephone

Email

Location

Credit period

Credit limit

Current balance

Overdue balance

Account status

Notes

Users must be able to:

Add a customer

Edit a customer

View a customer

Archive a customer

Search customers

Filter customers

View customer statements

Each customer profile should display:

Total invoiced

Total paid

Outstanding balance

Overdue balance

Available credit

Invoice history

Payment history

Aging breakdown

Last invoice

Last payment

Invoices

Create invoice records containing:

Invoice number

Customer

Invoice date

Credit period

Due date

Invoice amount

Amount paid

Outstanding balance

Payment status

Aging status

Notes

Invoice statuses:

Current

Partially paid

Overdue

Paid

Written off

Cancelled

Automatically calculate the due date using the customer’s credit period.

Automatically calculate:

outstanding_balance = invoice_amount - amount_paid

An invoice should only be classified as overdue when:

The outstanding balance is greater than zero

The current date is later than the due date

Do not classify every invoice with a balance as overdue.

Payments

Allow users to record:

Customer

Invoice

Payment date

Amount

Payment method

Receipt number

Transaction reference

Notes

Payment methods:

M-Pesa

Bank transfer

Cash

Cheque

Other

Support:

Partial payments

Full payments

One payment allocated to one invoice

One payment allocated across multiple invoices

Payment reversal with an audit trail

When a payment is recorded:

Update the invoice amount paid

Update the outstanding balance

Update the invoice status

Update the customer balance

Move fully paid accounts to Settled Accounts when appropriate

Aging Calculations

Calculate aging using the invoice due date.

Use these aging buckets:

Current

1–7 days overdue

8–14 days overdue

15–30 days overdue

31–60 days overdue

61–90 days overdue

More than 90 days overdue

Use urgency labels:

Current

Low

Medium

High

Critical

Suggested urgency rules:

Current: due date has not passed

Low: 1–7 days overdue

Medium: 8–30 days overdue

High: 31–60 days overdue

Critical: more than 60 days overdue

Sort overdue accounts from the oldest overdue balance to the newest.

Aging Accounts Page

Create a table showing:

Customer

Branch

Contact person

Telephone

Invoice number

Invoice date

Due date

Credit period

Days overdue

Invoice amount

Amount paid

Outstanding balance

Aging bucket

Urgency

Last follow-up

Action

Actions:

Record payment

View invoice

View customer

Add follow-up note

Download statement

Mark as disputed

Write off balance, administrator only

Add filters for:

Customer

Aging bucket

Urgency

Date range

Credit period

Balance range

Payment status

Settled Accounts

Display customers and invoices whose outstanding balance is zero.

Show:

Customer

Invoice number

Invoice amount

Total paid

Settlement date

Last payment date

Payment method

Allow users to search, filter, print, and export settled accounts.

Excel Import

Create an Excel import feature for the uploaded Foxtrot financial reports.

Allow .xlsx and .xls files.

The importer must support columns such as:

Invoice No.

Invoice Number

Invoive No.

Invoice Date

Date

Customer

Customer Name

Name

Amount

Amount VAT

Amount (VAT)

Amount Paid

Balance

Payment Date

Credit Days

Due Date

Treat spelling, spacing, and capitalisation variations as equivalent.

The import workflow must be:

Upload workbook

Read all worksheets

Detect headers

Map spreadsheet columns

Preview records

Detect duplicate invoices

Identify missing fields

Match customer names

Allow corrections

Approve import

Save approved records to Supabase

Do not save imported records automatically without a preview.

If the Excel files do not contain payment information, mark imported invoices as:

Payment status requires verification

Do not assume historical invoices are unpaid.

Allow users to classify imported invoices as:

Paid

Partially paid

Outstanding

Unknown

Written off

Follow-Up Tracking

Add follow-up records for overdue accounts.

Each follow-up should contain:

Customer

Invoice

Follow-up date

Contact method

Contacted person

Notes

Promise-to-pay date

Promise-to-pay amount

Follow-up status

Staff member

Contact methods:

Telephone

WhatsApp

Email

Physical visit

Other

Follow-up statuses:

No response

Promised payment

Partial payment expected

Disputed invoice

Escalated

Resolved

Display the next promised payment date on the aging account.

Reports

Create reports for:

Full aging report

Customer balance report

Overdue invoices

Current invoices

Settled invoices

Payments collected

Customer statements

Follow-up report

Promise-to-pay report

Written-off accounts

Import reconciliation

Support:

Date filters

Customer filters

Aging-bucket filters

Printing

CSV export

Excel-compatible export

PDF download

Database Tables

Create Supabase tables for:

profiles

id

full_name

email

phone

role

status

created_at

customers

id

customer_code

business_name

branch_name

contact_person

phone

email

location

credit_days

credit_limit

status

notes

created_at

updated_at

invoices

id

invoice_number

customer_id

invoice_date

due_date

credit_days

invoice_amount

amount_paid

outstanding_balance

payment_status

aging_bucket

disputed

written_off

import_batch_id

source_sheet

source_row

notes

created_by

created_at

updated_at

payments

id

customer_id

payment_date

amount

payment_method

receipt_number

reference_number

notes

created_by

created_at

payment_allocations

id

payment_id

invoice_id

allocated_amount

created_at

follow_ups

id

customer_id

invoice_id

follow_up_date

contact_method

contacted_person

notes

promise_to_pay_date

promise_to_pay_amount

status

created_by

created_at

import_batches

id

file_name

uploaded_by

uploaded_at

total_rows

approved_rows

duplicate_rows

rejected_rows

warning_rows

status

import_rows

id

import_batch_id

sheet_name

source_row

raw_data

mapped_data

validation_status

validation_messages

linked_invoice_id

audit_logs

id

user_id

action

entity_type

entity_id

previous_data

new_data

created_at

User Roles

Create these roles:

Administrator

Can manage users, settings, customers, invoices, payments, write-offs, imports, and reports.

Accounts Manager

Can manage customers, invoices, payments, imports, reports, and follow-ups.

Collections Officer

Can view aging accounts, record follow-ups, record payment promises, and view customer statements.

Viewer

Can only view dashboards and reports.

Enable Supabase Row Level Security.

Settings

Create settings for:

Company name

Company logo

Address

Telephone

Email

Currency

Default credit period

Invoice prefix

Receipt prefix

Aging buckets

Urgency rules

Use Kenyan shillings and format amounts as:

KES 25,000.00

Use the en-KE locale.

Design Requirements

Use:

Foxtrot branding

Professional white and light-grey interface

Red primary accent

Green settled indicators

Amber warning indicators

Red overdue indicators

Clear responsive tables

Collapsible sidebar

Mobile navigation

Confirmation dialogs

Loading states

Empty states

Error messages

Success notifications

Important Requirements

Do not build inventory management.

Do not build product-sales analytics.

Do not build payroll.

Do not build procurement.

Do not build a full accounting ERP.

The system must remain focused on:

Customer balances

Invoices

Payments

Overdue days

Aging buckets

Collections follow-ups

Settled accounts

Aging reports

All buttons, forms, filters, imports, downloads, calculations, and database operations must work.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://foxtrotagingaccountssystem.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a585ed6e-6539-4fe3-b4ad-23abf6a4e794).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
