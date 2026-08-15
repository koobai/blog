"""Compatibility entry point for the exercise monthly coaching pipeline.

The implementation lives under :mod:`jingzhe`; this module deliberately keeps
the historical import path used by Actions, local scripts, and downstream
automation.
"""

import os

from jingzhe import monthly_reports as _impl
from jingzhe.monthly_reports import *  # noqa: F401,F403


def request_deepseek_report(api_key, facts, correction=None):
    """Compatibility seam retained for callers that patch the root module."""
    return _impl.request_deepseek_report(api_key, facts, correction=correction)


def generate_report(api_key, facts):
    """Generate and validate a report through the historical root seam."""
    evidence_ids = {item['id'] for item in facts['evidence']}
    report = request_deepseek_report(api_key, facts)
    issue = _impl.validate_report(report, evidence_ids)
    if not issue:
        return {
            key: report[key]
            for key in ('verdict', 'analysis', 'next_plan', 'evidence_ids')
        }
    print(f'🔁 DeepSeek 月报未通过校验，定向重写一次: {issue}')
    report = request_deepseek_report(api_key, facts, correction=issue)
    issue = _impl.validate_report(report, evidence_ids)
    if issue:
        print(f'⚠️ DeepSeek 月报仍未通过校验: {issue}')
        return None
    return {
        key: report[key]
        for key in ('verdict', 'analysis', 'next_plan', 'evidence_ids')
    }


class DeepSeekReportProvider:
    """Compatibility provider using the patchable root generate function."""

    model = _impl.MODEL

    def __init__(self, api_key):
        self.api_key = api_key

    def generate(self, facts):
        return generate_report(self.api_key, facts)


def update_monthly_insights(
    activities,
    output_path,
    api_key=None,
    now=None,
    report_provider=None
):
    """Delegate state management while preserving the historical provider seam."""
    api_key = api_key or os.getenv('DEEPSEEK_API_KEY')
    provider = report_provider or (DeepSeekReportProvider(api_key) if api_key else None)
    return _impl.update_monthly_insights(
        activities,
        output_path,
        api_key=api_key,
        now=now,
        report_provider=provider
    )
