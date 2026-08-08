# Provable Record / State Auditor — `/audit` (`/structure`)

A minimum-viable x402-paywalled endpoint. A client agent POSTs a target
identifier (parcel ID, permit application number, or smart-contract
address); the server fetches the underlying record, normalizes it, stamps
it with a SHA-256 integrity hash, and — once a micro-payment settles —
hands back clean JSON.

## Setup

    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env   # fill in X402_PAY_TO_ADDRESS at minimum

## Run

    uvicorn app:app --reload --port 8402

## Test

    curl -i -X POST localhost:8402/audit \
      -H "Content-Type: application/json" \
      -d '{"target": "032-114-0090"}'
    # -> 402 challenge

    curl -i -X POST localhost:8402/audit \
      -H "Content-Type: application/json" \
      -H "X-PAYMENT: any-nonempty-blob-in-mock-mode" \
      -d '{"target": "032-114-0090"}'
    # -> 200 structured, hash-stamped record
