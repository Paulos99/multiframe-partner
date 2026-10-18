import os
import unittest
from unittest.mock import patch
from function_env import legacy_derived_key, version_environment

CUR, OLD, ADM, NEW = ("test-current-".ljust(40, "c"), "test-old-".ljust(40, "o"),
                      "test-admin-".ljust(40, "a"), "test-new-".ljust(40, "n"))


class FunctionEnvironmentTest(unittest.TestCase):
    def resolve(self, deploy, current=None, status=200, compromised=()):
        def request(method, url, token):
            self.assertEqual(method, "GET")
            self.assertIn("tag=%24latest", url)
            return status, {"environment": current or {}}
        with patch.dict(os.environ, deploy, clear=True):
            return version_environment("unused", "function", request, {}, compromised)

    def test_preserve_and_override(self):
        current = dict(JWT_SECRET=CUR, JWT_SECRET_PREVIOUS=OLD,
                       ANALYTICS_ADMIN_KEY=ADM, OTHER="keep")
        result = self.resolve({"JWT_SECRET": "", "JWT_SECRET_PREVIOUS": ""}, current)
        self.assertEqual(result, {**current, "CORS_ORIGIN": "https://paulos99.github.io",
                                 "ANALYTICS_KEY": "analytics-events.json", "PLATFORM_KEY": "platform-v2.json"})
        result = self.resolve({"JWT_SECRET": NEW, "CORS_ORIGIN": "http://localhost:5173"}, current)
        self.assertEqual(result["JWT_SECRET"], NEW)
        self.assertEqual(result["CORS_ORIGIN"], "http://localhost:5173")
        result = self.resolve({"JWT_SECRET_PREVIOUS_CLEAR": "true"}, current)
        self.assertNotIn("JWT_SECRET_PREVIOUS", result)

    def test_initial_deploy_and_fail_closed(self):
        values = dict(JWT_SECRET=CUR, ANALYTICS_ADMIN_KEY=ADM)
        self.assertNotIn("JWT_SECRET_PREVIOUS", self.resolve(values, status=404))
        for missing in values:
            with self.assertRaisesRegex(SystemExit, missing):
                self.resolve({k: v for k, v in values.items() if k != missing}, status=404)
        with self.assertRaisesRegex(SystemExit, "HTTP 403"):
            self.resolve(values, status=403)
        with self.assertRaisesRegex(SystemExit, "Remove JWT_SECRET_PREVIOUS"):
            self.resolve({**values, "JWT_SECRET_PREVIOUS": OLD, "JWT_SECRET_PREVIOUS_CLEAR": "true"})

    def test_refuses_weak_or_public_values(self):
        legacy = legacy_derived_key("folder", "sa")
        # Preserved function env still holding the public derived key / short demo key must stop the deploy.
        with self.assertRaisesRegex(SystemExit, "JWT_SECRET is too short or a known compromised"):
            self.resolve({}, dict(JWT_SECRET=legacy, ANALYTICS_ADMIN_KEY=ADM), compromised=(legacy,))
        with self.assertRaisesRegex(SystemExit, "ANALYTICS_ADMIN_KEY is too short"):
            self.resolve({}, dict(JWT_SECRET=CUR, ANALYTICS_ADMIN_KEY="short"))
        with self.assertRaisesRegex(SystemExit, "JWT_SECRET_PREVIOUS is too short or a known compromised"):
            self.resolve({"JWT_SECRET_PREVIOUS": legacy}, dict(JWT_SECRET=CUR, ANALYTICS_ADMIN_KEY=ADM),
                         compromised=(legacy,))
        # New GitHub Secrets override the compromised preserved values.
        result = self.resolve({"JWT_SECRET": NEW, "ANALYTICS_ADMIN_KEY": ADM},
                              dict(JWT_SECRET=legacy, ANALYTICS_ADMIN_KEY="short"), compromised=(legacy,))
        self.assertEqual((result["JWT_SECRET"], result["ANALYTICS_ADMIN_KEY"]), (NEW, ADM))


if __name__ == "__main__":
    unittest.main()
