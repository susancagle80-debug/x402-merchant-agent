"""
auditor.py — Provable Record / State Auditor

Core execution logic for the /audit endpoint:
  1. Classify an incoming target identifier (parcel ID, permit application
     number, or smart contract address).
  2. Fetch the underlying raw record (public-records API or on-chain read).
  3. Normalize it into a clean, structured JSON shape.
  4. Anchor its integrity with a timestamp + content hash.

Nothing in here talks HTTP or payments — that's app.py's job. This module
is pure "get the data, structure it, stamp it" logic so it's easy to test
and swap real data sources in later.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional


class TargetType(str, Enum):
    PARCEL_ID = "parcel_id"
    PERMIT_NUMBER = "permit_number"
    CONTRACT_ADDRESS = "contract_address"
    UNKNOWN = "unknown"


class AuditError(Exception):
    """Raised when a target can't be classified or its record can't be fetched."""


# ---------------------------------------------------------------------------
# 1. Target classification
# ---------------------------------------------------------------------------
# These patterns are intentionally loose starting points — tighten them to
# match the actual formats used by the county/municipality and chain(s)
# you support.

_EVM_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
_PERMIT_RE = re.compile(r"^(PMT|PERMIT|BP)[-_ ]?\d{4,}[-A-Z0-9]*$", re.IGNORECASE)
_PARCEL_RE = re.compile(r"^\d{2,3}-\d{2,3}-\d{2,4}(-\d{3,4})?$")  # e.g. 032-114-0090


def classify_target(target: str) -> TargetType:
    t = target.strip()
    if _EVM_ADDRESS_RE.match(t):
        return TargetType.CONTRACT_ADDRESS
    if _PERMIT_RE.match(t):
        return TargetType.PERMIT_NUMBER
    if _PARCEL_RE.match(t):
        return TargetType.PARCEL_ID
    return TargetType.UNKNOWN


# ---------------------------------------------------------------------------
# 2. Data source adapters (stubbed — wire these to real APIs)
# ---------------------------------------------------------------------------
# Each fetcher takes the raw target string and returns a plain dict of
# whatever the upstream source gives back. Keep them dumb; normalization
# happens separately in step 3.

def fetch_parcel_record(target: str) -> dict[str, Any]:
    """
    TODO: replace with a real county assessor / GIS API call, e.g.
    a socrata endpoint, a regrid.com lookup, or a scraped assessor page.
    """
    return {
        "source": "mock-county-assessor",
        "parcel_id": target,
        "owner_name": "REDACTED — wire real source",
        "situs_address": None,
        "land_use_code": None,
        "assessed_value": None,
        "last_sale_date": None,
    }


def fetch_permit_record(target: str) -> dict[str, Any]:
    """
    TODO: replace with a real permitting system API (Accela, EnerGov,
    CityWorks, or a municipal open-data portal).
    """
    return {
        "source": "mock-permit-system",
        "permit_number": target,
        "status": None,
        "application_date": None,
        "permit_type": None,
        "parcel_id": None,
    }


def fetch_contract_state(target: str, rpc_url: Optional[str] = None) -> dict[str, Any]:
    """
    TODO: replace with a real on-chain read, e.g. via web3.py / eth_call,
    an Etherscan/block-explorer API, or a subgraph query. `rpc_url` is
    threaded through so callers can point at mainnet/testnet/L2 as needed.
    """
    return {
        "source": "mock-chain-rpc",
        "address": target,
        "rpc_url": rpc_url,
        "bytecode_hash": None,
        "is_contract": None,
        "balance_wei": None,
    }


_FETCHERS: dict[TargetType, Callable[[str], dict[str, Any]]] = {
    TargetType.PARCEL_ID: fetch_parcel_record,
    TargetType.PERMIT_NUMBER: fetch_permit_record,
    TargetType.CONTRACT_ADDRESS: fetch_contract_state,
}


# ---------------------------------------------------------------------------
# 3 & 4. Normalize + integrity stamp
# ---------------------------------------------------------------------------

@dataclass
class AuditResult:
    target: str
    target_type: TargetType
    record: dict[str, Any]
    fetched_at: float = field(default_factory=time.time)
    record_hash: str = ""

    def to_json(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "target_type": self.target_type.value,
            "record": self.record,
            "verification": {
                "fetched_at": self.fetched_at,
                "fetched_at_iso": time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.fetched_at)
                ),
                "record_hash": self.record_hash,
                "hash_algorithm": "sha256",
            },
        }


def _stamp(record: dict[str, Any]) -> str:
    """
    Deterministic hash over the normalized record so any downstream agent
    can recompute it and confirm the payload wasn't altered in transit.
    This is an integrity anchor, not a legal attestation — swap in a
    signed/on-chain anchor later if you need stronger guarantees.
    """
    canonical = json.dumps(record, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def run_audit(target: str, *, rpc_url: Optional[str] = None) -> AuditResult:
    """Classify, fetch, normalize, and stamp a single target. Raises AuditError
    if the target can't be classified or the fetch fails."""
    target = target.strip()
    if not target:
        raise AuditError("target must be a non-empty string")

    target_type = classify_target(target)
    if target_type == TargetType.UNKNOWN:
        raise AuditError(
            f"could not classify target '{target}' as a parcel ID, permit "
            "number, or contract address"
        )

    fetcher = _FETCHERS[target_type]
    try:
        if target_type == TargetType.CONTRACT_ADDRESS:
            raw = fetcher(target, rpc_url)  # type: ignore[call-arg]
        else:
            raw = fetcher(target)
    except Exception as exc:  # noqa: BLE001 — surface as AuditError to the API layer
        raise AuditError(f"failed to fetch record for '{target}': {exc}") from exc

    record_hash = _stamp(raw)
    return AuditResult(
        target=target,
        target_type=target_type,
        record=raw,
        record_hash=record_hash,
    )
