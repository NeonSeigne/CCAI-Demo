"""School colours (app.theme in school.yaml): validation, the /api/config payload and contrast."""

import os
import unittest
from unittest.mock import patch

from pydantic import ValidationError

import app.config
from app.config import THEME_ROLES, ThemeConfig, load_settings

SHIPPED = ("uva", "cu-boulder", "uw-madison")
ROLES = {role: "#112233" for role in THEME_ROLES}

# Text colours shared by every school (DESIGN.md colours), per mode.
INK = {"light": "#14171F", "dark": "#EEF0F4"}


def _rgb(hex_value):
    h = hex_value.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)], (int(h[6:8], 16) / 255 if len(h) == 8 else 1.0)


def _over(top, bottom):
    """``top`` (which may carry alpha) composited over the opaque ``bottom``."""
    (rt, a), (rb, _) = _rgb(top), _rgb(bottom)
    return "#" + "".join(f"{round(t * a + b * (1 - a)):02X}" for t, b in zip(rt, rb))


def _luminance(hex_value):
    rgb, _ = _rgb(hex_value)
    c = [v / 255 for v in rgb]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(fg, bg):
    hi, lo = sorted([_luminance(_over(fg, bg)), _luminance(bg)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


# Text role on background role; every pair must read at 4.5:1 (DESIGN.md).
PAIRS = [
    ("on_deep", "deep"),
    ("on_deep_soft", "deep"),
    ("on_signal", "signal"),
    ("tint_ink", "tint"),
    ("mark_ink", "mark_bg"),
    ("on_deep", "band"),
]


def load_shipped(slug):
    app.config._settings = None
    with patch.dict(os.environ, {"SCHOOL": slug}):
        return load_settings()


class TestThemeValidation(unittest.TestCase):
    def test_accepts_every_role_and_uppercases(self):
        theme = ThemeConfig(light={**ROLES, "deep": "#abcdef"}, dark=ROLES)
        self.assertEqual(theme.light["deep"], "#ABCDEF")

    def test_missing_role_is_named(self):
        roles = {k: v for k, v in ROLES.items() if k != "signal"}
        with self.assertRaises(ValidationError) as caught:
            ThemeConfig(light=roles, dark=ROLES)
        self.assertIn("theme.light is missing signal", str(caught.exception))

    def test_unknown_role_is_named(self):
        with self.assertRaises(ValidationError) as caught:
            ThemeConfig(light=ROLES, dark={**ROLES, "sparkle": "#000000"})
        self.assertIn("theme.dark has unknown roles: sparkle", str(caught.exception))

    def test_bad_colour_is_named(self):
        with self.assertRaises(ValidationError) as caught:
            ThemeConfig(light={**ROLES, "tint": "orange"}, dark=ROLES)
        self.assertIn("tint", str(caught.exception))

    def test_overrides_are_allowed(self):
        theme = ThemeConfig(light={**ROLES, "life": "#C79A00"}, dark=ROLES)
        self.assertEqual(theme.light["life"], "#C79A00")


class TestShippedThemes(unittest.TestCase):
    def tearDown(self):
        app.config._settings = None

    def test_every_school_has_a_theme_in_config(self):
        for slug in SHIPPED:
            with self.subTest(slug=slug):
                config = load_shipped(slug).get_frontend_config()
                theme = config["app"]["theme"]
                self.assertEqual(set(THEME_ROLES) - set(theme["light"]), set())
                self.assertEqual(set(THEME_ROLES) - set(theme["dark"]), set())
                self.assertNotIn("primary_color", config["app"])

    def test_every_pair_reads_at_aa_in_both_modes(self):
        for slug in SHIPPED:
            theme = load_shipped(slug).app.theme
            for mode in ("light", "dark"):
                roles = getattr(theme, mode)
                for fg, bg in PAIRS:
                    with self.subTest(slug=slug, mode=mode, pair=f"{fg} on {bg}"):
                        self.assertGreaterEqual(contrast(roles[fg], roles[bg]), 4.5)
                with self.subTest(slug=slug, mode=mode, pair="ink on canvas"):
                    self.assertGreaterEqual(contrast(INK[mode], roles["canvas"]), 4.5)


if __name__ == "__main__":
    unittest.main()
