# AI-HUB-ENTERPRISE Repository Instructions

## Project Overview

Enterprise-grade AI Platform implementing:

* Zero Trust Architecture
* Cloud Native Infrastructure
* AI Governance
* DevSecOps
* PDPA Compliance
* GDPR
* ISO27001
* SOC2

## Repository Rules

* TypeScript First
* Security First
* Compliance First
* Test Driven Development
* Infrastructure as Code
* Audit Everything

## Architecture

Frontend → API Gateway → Services → Event Bus → Data Layer

## Standards

* pnpm workspace
* Turborepo
* Docker
* Kubernetes
* Terraform

## Pull Request Requirements

* Tests Passing
* Security Scan Passing
* No Secrets
* Audit Logging Implemented
* Documentation Updated

# Security Instructions

## Zero Trust Principles

* Never trust by default
* Verify explicitly
* Least privilege access
* Continuous validation

## Authentication

Required:

* OAuth2
* OIDC
* WebAuthn
* MFA

## Authorization

Required:

* RBAC
* ABAC
* Policy Enforcement

## Security Controls

* Audit Logging
* Threat Detection
* Session Monitoring
* Device Trust Validation

## Forbidden

* Hardcoded Secrets
* Plaintext Credentials
* Disabled Authentication
* Excessive Permissions

# PDPA Compliance Instructions

## Thailand PDPA Requirements

All systems must:

* Minimize data collection
* Encrypt sensitive data
* Log access events
* Support consent management
* Support data deletion requests
* Support data export requests

## Personal Data

Protect:

* Names
* Addresses
* Phone Numbers
* Email Addresses
* Government IDs

## Retention

Data retention must be documented.

## Audit

Every personal data access must be logged.

## Incident Response

Personal data breaches must be reportable.

# Frontend Instructions

Technology:
- Next.js
- React
- TypeScript
- Tailwind

Requirements:
- RBAC UI Controls
- MFA Support
- Accessibility
- Security Headers
- CSP Compatible

Pages:
- Dashboard
- Security Center
- Audit Center
- Compliance Center
- AI Console

Forbidden:
- Local Storage Secrets
- Hardcoded Tokens

# Backend Instructions

Services:
- API Gateway
- Auth Service
- User Service
- Audit Service
- Notification Service

Requirements:
- OpenAPI
- Audit Logs
- Rate Limiting
- Input Validation
- Structured Logging

Must Support:
- OAuth2
- OIDC
- WebAuthn
- Kafka Events

# Zero Trust Instructions

Architecture:

Cloudflare
↓
API Gateway
↓
Authentication
↓
Authorization
↓
Microservices
↓
Data Layer

Rules:

- Verify every request
- Verify device trust
- Verify session trust
- Verify user trust
- Continuous monitoring
- Risk-based access control

# Audit Instructions

Every service must:

- Generate audit events
- Use correlation IDs
- Store immutable logs
- Export to SIEM

Required Fields:

- timestamp
- userId
- action
- resource
- ipAddress
- deviceId
- result
