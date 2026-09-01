from __future__ import annotations

import sys
from pathlib import Path

COMFYUI_ROOT = Path(__file__).resolve().parents[3]
if str(COMFYUI_ROOT) not in sys.path:
    sys.path.insert(0, str(COMFYUI_ROOT))
