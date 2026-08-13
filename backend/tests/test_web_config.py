import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main


class WebConfigContractTests(unittest.TestCase):
    def test_empty_config_matches_declared_defaults(self):
        normalized = main.normalize_web_config_file({"onboardingCompleted": False})

        for key, value in main.DEFAULT_WEB_CONFIG.items():
            self.assertEqual(normalized[key], value)

    def test_legacy_keys_migrate_and_are_removed(self):
        normalized = main.normalize_web_config_file({
            "onboardingCompleted": False,
            "thumbnailWidth": 9000,
            "mosaicEnabled": "off",
            "itemsPerPage": 0,
            "preloadImageCount": -4,
            "autoOpenBrowser": "no",
        })

        self.assertEqual(normalized["thumbnailSize"], 4096)
        self.assertFalse(normalized["blurEnabled"])
        self.assertEqual(normalized["itemsPerPage"], 1)
        self.assertEqual(normalized["preloadImageCount"], 0)
        self.assertFalse(normalized["autoOpenBrowser"])
        self.assertNotIn("thumbnailWidth", normalized)
        self.assertNotIn("mosaicEnabled", normalized)

    def test_legacy_sidebar_defaults_migrate_to_compact_two_chip_width(self):
        for legacy_width in (300, 500):
            normalized = main.normalize_web_config_file({
                "onboardingCompleted": False,
                "sidebarWidth": legacy_width,
            })

            self.assertEqual(normalized["sidebarWidth"], 320)

    def test_invalid_enum_and_source_paths_fall_back_to_contract_values(self):
        normalized = main.normalize_web_config_file({
            "onboardingCompleted": False,
            "webTheme": "invalid-theme",
            "defaultViewMode": "grid",
            "librarySourceMode": "unknown",
            "pixivConfigPath": None,
            "mediaRootPath": None,
        })

        self.assertEqual(normalized["webTheme"], "dark")
        self.assertEqual(normalized["defaultViewMode"], "fullscreen")
        self.assertEqual(normalized["librarySourceMode"], "unconfigured")
        self.assertEqual(normalized["pixivConfigPath"], "")
        self.assertEqual(normalized["mediaRootPath"], "")

    def test_reader_and_locale_preferences_migrate_safely(self):
        normalized = main.normalize_web_config_file({
            "onboardingCompleted": False,
            "uiLanguage": "fr",
            "fullscreenPageLayout": "booklet",
            "fullscreenReadingDirection": "vertical",
            "fullscreenSpreadPairing": "alternating",
        })

        self.assertEqual(normalized["uiLanguage"], "zh-TW")
        self.assertEqual(normalized["fullscreenPageLayout"], "single")
        self.assertEqual(normalized["fullscreenReadingDirection"], "ltr")
        self.assertEqual(normalized["fullscreenSpreadPairing"], "cover-single")

        valid = main.normalize_web_config_file({
            "onboardingCompleted": False,
            "uiLanguage": "en",
            "fullscreenPageLayout": "spread",
            "fullscreenReadingDirection": "rtl",
            "fullscreenSpreadPairing": "first-page",
        })
        self.assertEqual(valid["uiLanguage"], "en")
        self.assertEqual(valid["fullscreenSpreadPairing"], "first-page")

        simplified_chinese = main.normalize_web_config_file({
            "onboardingCompleted": False,
            "uiLanguage": "zh-CN",
        })
        self.assertEqual(simplified_chinese["uiLanguage"], "zh-CN")

    def test_fullscreen_visual_and_video_preferences_are_normalized(self):
        normalized = main.normalize_web_config_file({
            "onboardingCompleted": False,
            "fullscreenShowToolbar": "off",
            "fullscreenShowThumbnails": "yes",
            "fullscreenShowCheckerboard": "yes",
            "fullscreenZoomMode": "invalid",
            "fullscreenVideoSeekSeconds": 999,
            "fullscreenVideoHoldPlaybackRate": 9,
            "fullscreenVideoMuted": "off",
            "videoVolume": 2,
            "videoAutoplay": "no",
        })

        self.assertFalse(normalized["fullscreenShowToolbar"])
        self.assertTrue(normalized["fullscreenShowThumbnails"])
        self.assertTrue(normalized["fullscreenShowCheckerboard"])
        self.assertEqual(normalized["fullscreenZoomMode"], "auto")
        self.assertEqual(normalized["fullscreenVideoSeekSeconds"], 60)
        self.assertEqual(normalized["fullscreenVideoHoldPlaybackRate"], 4)
        self.assertFalse(normalized["videoMuted"])
        self.assertEqual(normalized["videoVolume"], 1)
        self.assertFalse(normalized["videoAutoplay"])
        self.assertNotIn("fullscreenVideoMuted", normalized)


if __name__ == "__main__":
    unittest.main()
