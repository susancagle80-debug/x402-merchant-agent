"""
app.py — The Endpoint (/audit, aliased as /structure)

    POST /audit
    {
      "target": "032-114-0090"          # parcel ID, permit number, or 0x... contract address
      "rpc_url": "https://..."           # optional, only used for contract-address targets
    }

Flow:
  1. No X-PAYMENT header -> 402 with a PaymentRequirements challenge.
  2. X-PAYMENT header present -> verify/settle via x402.py.
  3. On successful settlement -> run_audit() classifies, fetches,
     normalizes, and hash-stamps the record, and we return it as JSON.

Run locally:
    pip install -r requirements.txt
    uvicorn app:app --reload --port 8402
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auditor import AuditError, run_audit
from x402 import PaymentInvalid, build_challenge, verify_and_settle

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("audit-endpoint")

app = FastAPI(title="Provable Record / State Auditor")

RESOURCE_PATH = "/audit"
RESOURCE_DESCRIPTION = "Structured, hash-stamped public record or on-chain state lookup"


class AuditRequest(BaseModel):
    target: str = Field(..., description="Parcel ID, permit application number, or contract address")
    rpc_url: str | None = Field(None, description="Optional RPC endpoint for contract-address targets")


async def _handle_audit(req: AuditRequest, x_payment: str | None) -> JSONResponse:
    try:
        settlement = verify_and_settle(x_payment, RESOURCE_PATH)
    except PaymentInvalid as exc:
        logger.info("payment missing/invalid: %s", exc)
        challenge = build_challenge(RESOURCE_PATH, RESOURCE_DESCRIPTION)
        return JSONResponse(status_code=402, content=challenge)

    try:
        result = run_audit(req.target, rpc_url=req.rpc_url)
    except AuditError as exc:
        return JSONResponse(status_code=422, content={"error": str(exc)})

    payload = result.to_json()
    payload["payment"] = {
        "network": settlement.get("network"),
        "transaction": settlement.get("transaction"),
    }
    return JSONResponse(status_code=200, content=payload)


@app.post("/audit")
async def audit(req: AuditRequest, x_payment: str | None = Header(default=None, alias="X-PAYMENT")):
    return await _handle_audit(req, x_payment)


@app.post("/structure")
async def structure(req: AuditRequest, x_payment: str | None = Header(default=None, alias="X-PAYMENT")):
    return await _handle_audit(req, x_payment)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
