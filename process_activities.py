"""Compatibility entry point for the exercise activity pipeline.

The implementation lives under :mod:`jingzhe`; the historical root command
and import path remain stable for GitHub Actions and local integrations.
"""

from jingzhe.activity_processing import *  # noqa: F401,F403


if __name__ == '__main__':
    raise SystemExit(main())
