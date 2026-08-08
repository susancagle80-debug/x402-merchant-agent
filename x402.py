"""
x402.py — minimal x402 paywall enforcement.

Implements the "exact" scheme from the x402 spec (https://x402.org) at the
level a merchant server needs:

  1. No X-PAYMENT header on the request  -> respond 402 with a
     PaymentRequirements challenge telling the client what to pay and where.
  2. X-PAYMENT header present            -> verify it against a facilitator,
     and if valid, settle it before handing back the resource.

This module deliberately talks to a "facilitator" (a separate service that
does the actual chain verification/settlement, per the x402 design) rather
than reimplementing EIP-3009 signature verification here. For local dev
without a facilitator, set X402_MODE=mock in the environment and it will
accept any well-formed payment header without touching a network.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx

X402_VERSION = 1

MODE = os.environ.get("X402_MODE", "mock")  # "mock" | "facilitator"
FACILITATOR_URL = os.environ.get("X402_FACILITATOR_URL", "https://x402.org/facilitator")
PAY_TO_ADDRESS = os.environ.get("X402_PAY_TO_ADDRESS", "0x0000000000000000000000000000000000dEaD")
NETWORK = os.environ.get("X402_NETWORK", "base-sepolia")
ASSET_ADDRESS = os.environ.get(
    "X402_ASSET_ADDRESS",
    "0x0000000000000000000000000000000000c0de",  # placeholder — set to the real USDC contract address for your target network
)
PRICE_ATOMIC = os.environ.get("X402_PRICE_ATOMIC", "5000")  # 0.005 USDC (6 decimals) by default


@dataclass
class PaymentRequirements:
    scheme: str
    network: str
    max_amount_required: str
    resource: str
    description: str
    mime_type: str
    pay_to: str
    asset: str
    max_timeout_seconds: int = 60

    def to_json(self) -> dict[str, Any]:
        return {
            "scheme": self.scheme,
            "network": self.network,
            "maxAmountRequired": self.max_amount_required,
            "resource": self.resource,
            "description": self.description,
            "mimeType": self.mime_type,
            "payTo": self.pay_to,
            "asset": self.asset,
            "maxTimeoutSeconds": self.max_timeout_seconds,
        }


def build_challenge(resource_path: str, description: str) -> dict[str, Any]:
    """Build the JSON body for a 402 response."""
    reqs = PaymentRequirements(
        scheme="exact",
        network=NETWORK,
        max_amount_required=PRICE_ATOMIC,
        resource=resource_path,
        description=description,
        mime_type="application/json",
        pay_to=PAY_TO_ADDRESS,
        asset=ASSET_ADDRESS,
    )
    return {
        "x402Version": X402_VERSION,
        "accepts": [reqs.to_json()],
        "error": "payment_required",
    }


class PaymentInvalid(Exception):
    pass


def _mock_verify_and_settle(payment_header: str, resource_path: str) -> dict[str, Any]:
    """
    Local-dev stand-in for a facilitator. Accepts any non-empty header that
    looks like base64/JSON-ish content, so you can exercise the full
    request -> 402 -> retry-with-payment -> 200 flow without wiring a real
    facilitator or funded wallet yet. DO NOT use in production.
    """
    if not payment_header or len(payment_header) < 10:
        raise PaymentInvalid("X-PAYMENT header missing or malformed")
    return {
        "success": True,
        "transaction": f"mock-tx-{int(time.time())}",
        "network": NETWORK,
        "payer": "mock-payer",
    }


def _facilitator_verify_and_settle(payment_header: str, resource_path: str) -> dict[str, Any]:
    reqs = build_challenge(resource_path, "audit record access")["accepts"][0]
    payload = {
        "x402Version": X402_VERSION,
        "paymentHeader": payment_header,
        "paymentRequirements": reqs,
    }
    with httpx.Client(timeout=10.0) as client:
        verify_resp = client.post(f"{FACILITATOR_URL}/verify", json=payload)
        verify_resp.raise_for_status()
        verify_data = verify_resp.json()
        if not verify_data.get("isValid"):
            raise PaymentInvalid(verify_data.get("invalidReason", "payment failed verification"))

        settle_resp = client.post(f"{FACILITATOR_URL}/settle", json=payload)
        settle_resp.raise_for_status()
        settle_data = settle_resp.json()
        if not settle_data.get("success"):
            raise PaymentInvalid(settle_data.get("error", "settlement failed"))
        return settle_data


def verify_and_settle(payment_header: Optional[str], resource_path: str) -> dict[str, Any]:
    """Raises PaymentInvalid if the payment doesn't check out."""
    if not payment_header:
        raise PaymentInvalid("no X-PAYMENT header on request")
    if MODE == "mock":
        return _mock_verify_and_settle(payment_header, resource_path)
    return _facilitator_verify_and_settle(payment_header, resource_path)
