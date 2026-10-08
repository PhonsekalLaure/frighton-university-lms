# Frighton University LMS - SIS Integration Guide

## Overview
The Library Management System communicates with the Student Information System (SIS) via REST APIs.

- **SIS API URL**: `http://localhost:5000` (configurable via `SIS_API_URL`)
- **Shared Authentication Header**: `x-lms-api-key: frighton-lms-sis-shared-secret-key-change-in-prod`
- **Ports**:
  - LMS Client: `http://localhost:3001`
  - LMS API Server: `http://localhost:5001`
  - SIS Client: `http://localhost:3000`
  - SIS API Server: `http://localhost:5000`
